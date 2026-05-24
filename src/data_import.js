import L from 'leaflet';
import { importGeoJSONFeatures } from './poi_manager.js';
import { Trash2 } from 'lucide';
import { lucideStr } from './utils.js';
import 'leaflet.vectorgrid';
import * as turf from '@turf/turf';
import omnivore from '@mapbox/leaflet-omnivore';
import { loadShapefileZip, loadFolder } from './import/shapefile_loader.js';
import { resolveGeoJSONCRS, reprojectGeoJSON } from './import/projection_resolver.js';
import { extractPropertyKeys, openCopyDialog } from './import/copy_dialog.js';

// ============================================================
// 状態
// ============================================================
/**
 * layers: Array<{
 *   id:           string,
 *   fileName:     string,
 *   color:        string,
 *   visible:      boolean,
 *   vLayer:       L.VectorGrid,
 *   geojsonData:  GeoJSON,
 *   tooltips:     L.Tooltip[],
 *   labelAttr:    string|null,
 * }>
 */
let layers    = [];
let mapRef    = null;

const COLOR_PALETTE = [
  '#00eeff', '#ff6b35', '#a8e063', '#8855ff',
  '#ff69b4', '#ffd700', '#40e0d0', '#ff4444',
];
let colorIndex = 0;

// ============================================================
// IndexedDB
// ============================================================
const DB_NAME    = 'importDataDB';
const STORE_NAME = 'geojsonData';
let db;

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onerror         = e => reject(e.target.error);
    req.onsuccess       = e => { db = e.target.result; resolve(); };
    req.onupgradeneeded = e => {
      db = e.target.result;
      if (db.objectStoreNames.contains(STORE_NAME)) db.deleteObjectStore(STORE_NAME);
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
  });
}

function saveLayerToDB(entry) {
  if (!db) return;
  db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).put({
    id: entry.id, fileName: entry.fileName, color: entry.color,
    visible: entry.visible, geojsonData: entry.geojsonData, labelAttr: entry.labelAttr,
  });
}

function deleteLayerFromDB(id) {
  if (!db) return;
  db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).delete(id);
}

function loadAllLayersFromDB() {
  return new Promise((resolve, reject) => {
    if (!db) { resolve([]); return; }
    const req = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).getAll();
    req.onsuccess = e => resolve(e.target.result ?? []);
    req.onerror   = e => reject(e.target.error);
  });
}

function clearAllLayersFromDB() {
  if (!db) return;
  db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).clear();
}

// ============================================================
// 読み込みプログレス
// ============================================================
function showProgress(msg) {
  const el    = document.getElementById('import-progress');
  const msgEl = document.getElementById('import-progress-msg');
  if (el)    el.classList.remove('d-none');
  if (msgEl) msgEl.textContent = msg;
}

function hideProgress() {
  document.getElementById('import-progress')?.classList.add('d-none');
}

// ============================================================
// 公開API
// ============================================================
export async function initDataImport(map) {
  mapRef = map;
  await initIndexedDB();

  try {
    const saved = await loadAllLayersFromDB();
    saved.forEach(entry => {
      const pi = COLOR_PALETTE.indexOf(entry.color);
      if (pi >= 0) colorIndex = Math.max(colorIndex, pi + 1);
      addVectorLayer(
        entry.geojsonData, entry.fileName, entry.color,
        entry.visible, entry.id, entry.labelAttr ?? null
      );
    });
  } catch (err) {
    console.error('インポートデータの復元失敗:', err);
  }

  document.getElementById('loadGeoJSON').addEventListener('click',  () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change',   e  => loadFile(e));
  document.getElementById('loadShpFolder').addEventListener('click', () => document.getElementById('folderInput').click());
  document.getElementById('folderInput').addEventListener('change',  async e => {
    try { await loadFolder(e, registerLayer, showProgress); }
    finally { hideProgress(); }
  });
  document.getElementById('clearGeojson').addEventListener('click', ()  => clearAll());
}

// ============================================================
// ファイル読み込み
// ============================================================
async function loadFile(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  event.target.value = '';

  const file = files[0];
  const name = file.name.toLowerCase();

  if (name.endsWith('.kml') || name.endsWith('.gpx')) { loadViaOmnivore(file, name); return; }
  if (name.endsWith('.geojson') || name.endsWith('.json')) {
    showProgress('ファイルを読み込み中…');
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        showProgress('データを解析中…');
        const data = JSON.parse(e.target.result);
        const srcProj = await resolveGeoJSONCRS(data.crs ?? null);
        if (srcProj) {
          showProgress('座標を変換中…');
          console.log(`GeoJSON 座標変換: ${srcProj} → WGS84`);
        }
        await registerLayer(reprojectGeoJSON(data, srcProj), file.name);
      } catch (err) { alert('GeoJSONの解析に失敗しました。'); console.error(err); }
      finally { hideProgress(); }
    };
    reader.readAsText(file);
    return;
  }
  if (name.endsWith('.zip')) {
    try {
      await loadShapefileZip(file, registerLayer, showProgress);
    } finally { hideProgress(); }
    return;
  }
  alert('対応フォーマット: GeoJSON (.geojson/.json)、KML (.kml)、GPX (.gpx)、Shapefile ZIP (.zip)');
}

function loadViaOmnivore(file, name) {
  showProgress('ファイルを読み込み中…');
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      showProgress('データを解析中…');
      const temp = name.endsWith('.kml')
        ? omnivore.kml.parse(e.target.result)
        : omnivore.gpx.parse(e.target.result);
      const data = temp.toGeoJSON();
      if (!data?.features?.length) { alert('データが空か変換に失敗しました。'); return; }
      await registerLayer(data, file.name);
    } catch (err) { alert('ファイルの解析に失敗しました。'); console.error(err); }
    finally { hideProgress(); }
  };
  reader.readAsText(file);
}

// ============================================================
// レイヤー登録
// ============================================================
async function registerLayer(data, fileName) {
  const color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
  colorIndex++;
  const id = `layer_${Date.now()}`;
  showProgress('地図に描画中…');
  await new Promise(resolve => setTimeout(resolve, 0)); // UIを更新してから重い処理へ
  addVectorLayer(data, fileName, color, true, id, null);
  const entry = layers.find(l => l.id === id);
  if (entry) saveLayerToDB(entry);
}

export function addImportedGeoJSON(data, fileName) {
  registerLayer(data, fileName);
}

// ============================================================
// VectorGrid
// ============================================================
function makeStyle(color) {
  return {
    radius:      5,
    fillColor:   color,
    fillOpacity: 0,
    color:       color,
    weight:      2,
    opacity:     1,
    fill:        true,   // fillOpacity:0 で透明のまま内部もタップ検出
  };
}


function buildVLayer(data, color, id) {
  const tagged = {
    ...data,
    features: data.features.map((f, i) => ({
      ...f, properties: { ...f.properties, _fid: i },
    })),
  };
  return L.vectorGrid.slicer(tagged, {
    maxZoom: 23, tolerance: 3, extent: 4096, buffer: 64,
    indexMaxZoom: 9, indexMaxPoints: 100,
    interactive: true, pane: 'overlayPane', zIndex: 400,
    getFeatureId: f => f.properties._fid,
    vectorTileLayerStyles: { [id]: makeStyle(color) },
  });
}

function addVectorLayer(data, fileName, color, visible, id, labelAttr) {
  const vLayer = buildVLayer(data, color, id);
  const entry  = { id, fileName, color, visible, vLayer, geojsonData: data, tooltips: [], labelAttr };

  vLayer.on('click', e => {
    const fid     = e.layer.properties?._fid;
    const feature = fid != null ? data.features[fid] : null;
    const props   = { ...(feature?.properties ?? e.layer.properties ?? {}) };
    delete props._fid;

    const rows = Object.entries(props)
      .map(([k, v]) => `<tr><td style="padding:2px 6px;font-weight:bold;white-space:nowrap">${k}</td><td style="padding:2px 6px;word-break:break-all">${v ?? ''}</td></tr>`)
      .join('');
    const content = rows
      ? `<div style="max-height:220px;overflow-y:auto;font-size:13px"><table>${rows}</table></div>`
      : '<span style="font-size:13px">（属性なし）</span>';

    L.popup({ maxWidth: 280 }).setLatLng(e.latlng).setContent(content).openOn(mapRef);
    L.DomEvent.stopPropagation(e);
  });

  if (visible) vLayer.addTo(mapRef);
  layers.push(entry);

  if (layers.length === 1) {
    try {
      const bbox = turf.bbox(data);
      mapRef.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
    } catch (e) { console.warn('fitBounds失敗:', e); }
  }

  if (labelAttr) applyLabelForEntry(entry, labelAttr);

  renderLayerList();
}

// ============================================================
// 色変更
// ============================================================
function changeColor(id, newColor) {
  const entry = layers.find(l => l.id === id);
  if (!entry) return;
  entry.color = newColor;
  const style = makeStyle(newColor);
  for (let i = 0; i < entry.geojsonData.features.length; i++) {
    entry.vLayer.setFeatureStyle(i, style);
  }
  saveLayerToDB(entry);
}

// ============================================================
// 表示/非表示
// ============================================================
function toggleVisibility(id, visible) {
  const entry = layers.find(l => l.id === id);
  if (!entry) return;
  entry.visible = visible;
  visible ? entry.vLayer.addTo(mapRef) : mapRef.removeLayer(entry.vLayer);
  entry.tooltips.forEach(t => {
    visible ? t.addTo(mapRef) : mapRef.removeLayer(t);
  });
  saveLayerToDB(entry);
}

// ============================================================
// レイヤー削除
// ============================================================
function removeLayer(id) {
  const index = layers.findIndex(l => l.id === id);
  if (index === -1) return;
  const entry = layers[index];
  mapRef.removeLayer(entry.vLayer);
  clearTooltipsForEntry(entry);
  layers.splice(index, 1);
  deleteLayerFromDB(id);
  renderLayerList();
}

// ============================================================
// ラベル
// ============================================================
function applyLabelForEntry(entry, attr) {
  clearTooltipsForEntry(entry);
  entry.labelAttr = attr;

  entry.geojsonData.features.forEach(feature => {
    const text = String(feature.properties?.[attr] ?? '').trim();
    if (!text) return;

    const geomType = feature.geometry.type;
    let latlng;
    if (geomType === 'Point') {
      const [lng, lat] = feature.geometry.coordinates;
      latlng = L.latLng(lat, lng);
    } else {
      const center = turf.pointOnFeature(feature).geometry.coordinates;
      latlng = L.latLng(center[1], center[0]);
    }

    const tooltip = L.tooltip({
      permanent: true,
      direction: geomType === 'Point' ? 'right' : 'center',
      className: 'my-label-tooltip',
    }).setContent(text).setLatLng(latlng);

    if (entry.visible) tooltip.addTo(mapRef);
    entry.tooltips.push(tooltip);
  });

  saveLayerToDB(entry);
}

function clearTooltipsForEntry(entry) {
  entry.tooltips.forEach(t => mapRef.removeLayer(t));
  entry.tooltips = [];
  entry.labelAttr = null;
}

function fitToEntry(entry) {
  try {
    const bbox = turf.bbox(entry.geojsonData);
    mapRef.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
  } catch (e) {
    console.warn('fitBounds失敗:', e);
  }
}

// ============================================================
// ファイル一覧UI
// ============================================================
function renderLayerList() {
  const container = document.getElementById('layer-list');
  container.innerHTML = '';
  if (layers.length === 0) return;

  layers.forEach(entry => {
    const keys = extractPropertyKeys(entry.geojsonData);

    const item = document.createElement('div');
    item.className  = 'layer-item';
    item.dataset.id = entry.id;

    // ── 上段：チェック・ファイル名・カラーピッカー・削除 ──
    const row = document.createElement('div');
    row.className = 'layer-item__row';

    const checkbox   = document.createElement('input');
    checkbox.type    = 'checkbox';
    checkbox.checked = entry.visible;
    checkbox.title   = '表示/非表示';
    checkbox.style.cssText = 'flex-shrink:0; cursor:pointer; width:15px; height:15px;';
    checkbox.addEventListener('change', () => toggleVisibility(entry.id, checkbox.checked));

    const nameEl = document.createElement('span');
    nameEl.className   = 'layer-item__name layer-item__name--link';
    nameEl.textContent = entry.fileName;
    nameEl.title       = 'タップしてデータの範囲に移動';
    nameEl.addEventListener('click', () => fitToEntry(entry));

    const colorPicker = document.createElement('input');
    colorPicker.type      = 'color';
    colorPicker.value     = entry.color;
    colorPicker.title     = '色を変更';
    colorPicker.className = 'layer-item__color';
    colorPicker.addEventListener('input', () => changeColor(entry.id, colorPicker.value));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'layer-item__delete';
    deleteBtn.innerHTML = lucideStr(Trash2, 16);
    deleteBtn.title     = '削除';
    deleteBtn.addEventListener('click', () => {
      if (confirm(`「${entry.fileName}」を削除しますか？`)) removeLayer(entry.id);
    });

    row.append(checkbox, nameEl, colorPicker, deleteBtn);

    // ── 下段：ラベル属性セレクト ──
    const labelRow = document.createElement('div');
    labelRow.className = 'layer-item__label-row';

    const select = document.createElement('select');
    select.className = 'layer-item__label-select';

    const emptyOpt = document.createElement('option');
    emptyOpt.value       = '';
    emptyOpt.textContent = '── ラベルなし ──';
    if (!entry.labelAttr) emptyOpt.selected = true;
    select.appendChild(emptyOpt);

    keys.forEach(key => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = key;
      if (key === entry.labelAttr) opt.selected = true;
      select.appendChild(opt);
    });

    select.addEventListener('change', () => {
      if (select.value === '') {
        clearTooltipsForEntry(entry);
        renderLayerList();
      } else {
        applyLabelForEntry(entry, select.value);
        renderLayerList();
      }
    });

    if (keys.length > 0) labelRow.append(select);

    // コピーボタン行
    const copyRow = document.createElement('div');
    copyRow.className = 'layer-item__copy-row';
    const copyBtn = document.createElement('button');
    copyBtn.className   = 'layer-item__copy-btn';
    copyBtn.textContent = '登録データにコピー';
    copyBtn.title       = 'このレイヤーのデータを登録地点にコピーする';
    copyBtn.addEventListener('click', async () => {
      const fieldMap = await openCopyDialog(entry);
      if (!fieldMap) return;
      copyBtn.disabled    = true;
      copyBtn.textContent = 'コピー中…';
      try {
        const count = await importGeoJSONFeatures(entry.geojsonData, fieldMap);
        alert(`${count}件のPOIをコピーしました。`);
      } finally {
        copyBtn.disabled    = false;
        copyBtn.textContent = '登録データにコピー';
      }
    });
    copyRow.appendChild(copyBtn);

    item.append(row, labelRow, copyRow);
    container.appendChild(item);
  });
}

// ============================================================
// 全消去
// ============================================================
function clearAll() {
  if (layers.length === 0) { alert('表示中のデータはありません。'); return; }
  if (!confirm('すべての読み込みレイヤーを削除しますか？')) return;
  layers.forEach(e => {
    mapRef.removeLayer(e.vLayer);
    clearTooltipsForEntry(e);
  });
  layers = [];
  clearAllLayersFromDB();
  renderLayerList();
}
