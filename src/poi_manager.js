import L from 'leaflet';
import {
  loadAllPOI,
  savePOIArrayToDB,
  deletePOIFromDB,
  clearAllPOI as clearAllPOIFromDB,
  deletePhotoFromDB,
  savePhotoToDB,
  savePolygonToDB,
  loadAllPolygons,
  deletePolygonFromDB,
  updatePolygonInDB,
  clearAllPolygons as clearAllPolygonsFromDB,
  loadAllLines,
  saveAllLinesToDB,
} from './indexedDB_poi_storage.js';
import {
  getPhotoObjectURL,
  downloadPhotoWithExif,
} from './photo_manager.js';
import { getLineLatlngs, calcLineLength, formatLength } from './poi/distance_calc.js';
import {
  LINE_STYLE, initLineModeModule,
  createLinePopupContent, bindLinePopup,
  startLineMode, endLineMode, addVertexToLine, undoLastViaPoint,
  updateLineModeUI, refreshAllPopups, setLineStyleColor,
  isVertexEditActive,
} from './poi/line_mode.js';
import {
  initPolygonVertexEditModule, startPolygonVertexEdit, isPolygonVertexEditActive,
} from './poi/polygon_vertex_edit.js';
import {
  initPolygonSplitModule, startPolygonSplitMode, isSplitModeActive,
} from './poi/polygon_split.js';
import {
  initLabelSystem,
  updatePOILabel, updateLineLabel, updatePolygonLabel,
  updateAllLabels, syncLabelUI,
  toggleAllLabels, setGlobalLabelMode,
} from './poi/label_system.js';
import { renderDataList, toDateStr } from './poi/data_list_ui.js';
import { openShareModalWithData } from './data_share.js';
import * as turf from '@turf/turf';

// ============================================================
// 状態
// ============================================================
const POI_STORAGE_KEY  = 'poiArray';
const LINE_STORAGE_KEY = 'poiLines';
const POI_COLOR_KEY    = 'poiColor';

let poiArray     = [];
let lineArray    = [];
let polygonArray = [];
let mapRef        = null;
let labelsVisible   = localStorage.getItem('labelsVisible')   !== 'false';
let globalLabelMode = localStorage.getItem('globalLabelMode') || 'number';
let currentColor    = localStorage.getItem(POI_COLOR_KEY)     || '#004926';

let lineMode = {
  active:           false,
  lineId:           null,
  polylineInstance: null,
  poiIds:           [],
  vertices:         [],
};

let pendingLineModeStart = false;

function updatePendingLineModeUI() {
  const el = document.getElementById('pending-line-indicator');
  if (el) el.style.display = pendingLineModeStart ? 'inline-flex' : 'none';
}

// ============================================================
// サブモジュールへの状態プロキシ
// ============================================================

// line_mode.js が必要とする ctx
const lineModeCtx = {
  get lineMode()              { return lineMode; },
  set lineMode(v)             { lineMode = v; },
  get lineArray()             { return lineArray; },
  get lineArrayRef()          { return lineArray; },
  get poiArray()              { return poiArray; },
  get mapRef()                { return mapRef; },
  savePOIArray:               () => savePOIArray(),
  saveLines:                  () => saveLines(),
  deletePOIFromDB:            (id) => deletePOIFromDB(id),
  createPopupContent:         (poi) => createPopupContent(poi),
  updatePOILabel:             (poi) => updatePOILabel(poi),
  renderDataList:             (map) => renderDataList(map, poiArray, lineArray, dataListOps),
  editLine:                   (map, line) => editLine(map, line),
  removeLineById:             (map, id) => removeLineById(map, id),
  isLineVertexEditActive:     () => isVertexEditActive(),
  isPolygonVertexEditActive:  () => isPolygonVertexEditActive(),
  isSplitModeActive:          () => isSplitModeActive(),
  getLineLatlngs:             (line) => getLineLatlngs(line, poiArray),
  updatePolygonInDB:          (data) => updatePolygonInDB(data),
  updatePolygonLabel:         (rec) => updatePolygonLabel(rec),
  refreshPolygonPopup:        (rec) => { if (rec.layer) rec.layer.setPopupContent(createPolygonPopupContent(rec)); },
};
// lineArray は配列参照を通じて変更が反映されるが、
// 再代入（lineArray = ...）が必要な箇所はローカル関数で処理する
initLineModeModule(lineModeCtx);
initPolygonVertexEditModule(lineModeCtx);
initPolygonSplitModule(lineModeCtx);

// label_system.js が必要とする ctx
const labelCtx = {
  get labelsVisible()     { return labelsVisible; },
  set labelsVisible(v)    { labelsVisible = v; },
  get globalLabelMode()   { return globalLabelMode; },
  set globalLabelMode(v)  { globalLabelMode = v; },
  get poiArray()          { return poiArray; },
  get lineArray()         { return lineArray; },
  get polygonArray()      { return polygonArray; },
  get mapRef()            { return mapRef; },
};
initLabelSystem(labelCtx);

function makePolygonStyle(color) {
  return { color, fillColor: color, fillOpacity: 0.2, weight: 2 };
}

function addPolygonToMap(feature) {
  return L.geoJSON(feature, { style: makePolygonStyle(currentColor) }).addTo(mapRef);
}

function createPolygonPopupContent(rec) {
  const areaStr = rec.feature ? formatArea(turf.area(rec.feature)) : '不明';
  return (
    `<div class="popup-content">` +
      `名前: ${rec.name || '（未設定）'}<br>` +
      `説明: ${rec.description || '（なし）'}<br>` +
      `面積: ${areaStr}` +
    `</div>` +
    `<div class="popup-buttons">` +
      `<button id="polygon-edit-btn"        class="edit-button">編集</button>` +
      `<button id="polygon-vertex-edit-btn" class="line-vertex-edit-button">頂点編集</button>` +
      `<button id="polygon-split-btn"       class="split-button">分割</button>` +
      `<button id="polygon-delete-btn"      class="delete-button">削除</button>` +
    `</div>`
  );
}

function unbindPolygonHighlight(rec) {
  if (rec._popupopenHandler)  { mapRef.off('popupopen',  rec._popupopenHandler);  rec._popupopenHandler  = null; }
  if (rec._popupcloseHandler) { mapRef.off('popupclose', rec._popupcloseHandler); rec._popupcloseHandler = null; }
}

function bindPolygonPopup(rec) {
  unbindPolygonHighlight(rec);
  rec.layer.bindPopup(createPolygonPopupContent(rec));
  rec.layer.on('click', e => {
    L.DomEvent.stopPropagation(e);
    rec.layer.openPopup(e.latlng);
  });
  rec.layer.on('popupopen', () => {
    requestAnimationFrame(() => {
      document.getElementById('polygon-edit-btn')?.addEventListener('click', () => {
        rec.layer.closePopup();
        editPolygon(rec);
      });
      document.getElementById('polygon-vertex-edit-btn')?.addEventListener('click', () => {
        rec.layer.closePopup();
        startPolygonVertexEdit(mapRef, rec);
      });
      document.getElementById('polygon-split-btn')?.addEventListener('click', () => {
        rec.layer.closePopup();
        startPolygonSplitMode(mapRef, rec, lineArray, {
          onSplitComplete: async (halves, oldId) => {
            await dataListOps.deletePolygon(oldId);
            const timestamp = new Date().toISOString();
            for (const { feature, name, description } of halves) {
              const layer = addPolygonToMap(feature);
              const id    = await savePolygonToDB({ feature, timestamp, name, description });
              const newRec = { id, feature, timestamp, name, description, layer };
              bindPolygonPopup(newRec);
              polygonArray.push(newRec);
            }
            renderDataList(mapRef, poiArray, lineArray, dataListOps);
          },
          onCancel: () => {},
        });
      });
      document.getElementById('polygon-delete-btn')?.addEventListener('click', async () => {
        if (confirm('このポリゴンを削除しますか？')) {
          rec.layer.closePopup();
          await dataListOps.deletePolygon(rec.id);
        }
      });
    });
  });
  const _isThisPopup = e => { if (!rec.layer) return false; const s = e.popup._source; return s && (s === rec.layer || rec.layer.hasLayer(s)); };
  rec._popupopenHandler  = e => { if (_isThisPopup(e)) rec.layer.setStyle({ color: currentColor, weight: 2, fillColor: '#ff8c00', fillOpacity: 0.5 }); };
  rec._popupcloseHandler = e => { if (_isThisPopup(e)) rec.layer.setStyle(makePolygonStyle(currentColor)); };
  mapRef.on('popupopen',  rec._popupopenHandler);
  mapRef.on('popupclose', rec._popupcloseHandler);
}

const dataListOps = {
  deletePOI:        (map, poi, marker) => deletePOI(map, poi, marker),
  removeLineById:   (map, id) => removeLineById(map, id),
  editLine:         (map, line) => editLine(map, line),
  getPolygons:      () => polygonArray,
  editPolygon:      (rec) => editPolygon(rec),
  deletePolygon:    async (id) => {
    const rec = polygonArray.find(p => p.id === id);
    if (rec) { unbindPolygonHighlight(rec); if (rec.layer) mapRef.removeLayer(rec.layer); }
    await deletePolygonFromDB(id);
    polygonArray = polygonArray.filter(p => p.id !== id);
    renderDataList(mapRef, poiArray, lineArray, dataListOps);
  },
  exportByDate: (dateStr) => {
    const filteredPOIs = poiArray.filter(p => toDateStr(p.timestamp) === dateStr);
    const filteredLines = lineArray.filter(line => {
      const firstPoi = poiArray.find(p => p.id === line.poiIds[0]);
      return firstPoi && toDateStr(firstPoi.timestamp) === dateStr;
    });
    const filteredPolygons = polygonArray
      .filter(rec =>
        rec.timestamp
          ? toDateStr(new Date(rec.timestamp)) === dateStr
          : dateStr === '日付不明'
      )
      .map(rec => ({
        ...rec.feature,
        properties: { ...(rec.feature?.properties ?? {}), timestamp: rec.timestamp || null },
      }));
    openShareModalWithData(filteredPOIs, filteredLines, filteredPolygons, dateStr);
  },
  polygonizeAllLines: async (lines) => {
    const lineFeatures = lines
      .map(l => getLineLatlngs(l, poiArray))
      .filter(lls => lls.length >= 2)
      .map(lls => {
        const raw = lls.map(ll => [ll.lng, ll.lat]);
        // 連続する重複座標を除去（同一点が連続するとpolygonize内部でデジェネレートリングが発生する）
        const coords = raw.filter((c, i) => i === 0 || c[0] !== raw[i-1][0] || c[1] !== raw[i-1][1]);
        return coords.length >= 2 ? turf.lineString(coords) : null;
      })
      .filter(Boolean);
    if (!lineFeatures.length) { alert('有効なラインがありません。'); return; }
    let result;
    try {
      result = turf.polygonize(turf.featureCollection(lineFeatures));
    } catch (e) {
      console.error('polygonize error:', e);
      alert('ポリゴン化に失敗しました。ラインに重複点や極端に短いセグメントがないか確認してください。');
      return;
    }
    if (!result.features.length) { alert('閉じた領域が見つかりませんでした。ラインが交差・接続しているか確認してください。'); return; }

    // 穴開きポリゴン処理: 内側ポリゴンを外側の穴として適用（内側は独立ポリゴンとして保持）
    const rawFeats = result.features;
    const n = rawFeats.length;
    if (n > 1) {
      const innerSet = new Set();
      const holesOf = new Map();
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          try {
            if (turf.booleanContains(rawFeats[i], rawFeats[j])) {
              innerSet.add(j);
              if (!holesOf.has(i)) holesOf.set(i, []);
              holesOf.get(i).push(j);
            }
          } catch (_) { /* 無効ジオメトリは無視 */ }
        }
      }
      if (innerSet.size > 0) {
        // 内側ポリゴンの重複排除（turf.polygonizeが同リングをCW/CCW両方向で返す場合の対策）
        const uniqueInnerIdx = [];
        for (const idx of innerSet) {
          const c = turf.centroid(rawFeats[idx]).geometry.coordinates;
          const isDup = uniqueInnerIdx.some(ui => {
            const uc = turf.centroid(rawFeats[ui]).geometry.coordinates;
            return Math.abs(uc[0] - c[0]) < 1e-8 && Math.abs(uc[1] - c[1]) < 1e-8;
          });
          if (!isDup) uniqueInnerIdx.push(idx);
        }
        const uniqueInnerSet = new Set(uniqueInnerIdx);

        const merged = [];
        for (let i = 0; i < n; i++) {
          if (innerSet.has(i)) {
            if (uniqueInnerSet.has(i)) merged.push(rawFeats[i]);
            continue;
          }
          let feat = rawFeats[i];
          for (const holeIdx of (holesOf.get(i) || [])) {
            if (!uniqueInnerSet.has(holeIdx)) continue;
            const diff = turf.difference(turf.featureCollection([feat, rawFeats[holeIdx]]));
            if (diff) feat = diff;
          }
          merged.push(feat);
        }
        result.features = merged;
      }
    }

    const outerRingKey = f => JSON.stringify(
      f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates[0][0] : f.geometry.coordinates[0]
    );
    const polygonKey   = f => JSON.stringify(f.geometry.coordinates);
    const newKeys      = new Map(result.features.map(f => [polygonKey(f), f]));
    const oldKeys      = new Map(polygonArray.map(r => [polygonKey(r.feature), r]));
    const oldOuterKeys = new Map(polygonArray.map(r => [outerRingKey(r.feature), r]));
    const newOuterKeys = new Set(result.features.map(f => outerRingKey(f)));

    // 全旧レコードを保存（oldKeysはMap＝重複排除済みのため、全件を別途保持）
    const allOldRecs = [...polygonArray];

    // 新規結果にないポリゴンを削除（外輪一致があれば穴追加として保持）
    for (const [key, rec] of oldKeys) {
      if (!newKeys.has(key) && !newOuterKeys.has(outerRingKey(rec.feature))) {
        unbindPolygonHighlight(rec);
        if (rec.layer) { mapRef.removeLayer(rec.layer); rec.layer = null; }
        await deletePolygonFromDB(rec.id);
      }
    }

    // 一致するものは属性引き継ぎ（完全一致→外輪一致の順）、新規のものは追加
    const nextArray = [];
    const timestamp = new Date().toISOString();
    for (const [key, feature] of newKeys) {
      const exactMatch = oldKeys.get(key);
      const outerMatch = exactMatch ? null : oldOuterKeys.get(outerRingKey(feature));
      const existing = exactMatch || outerMatch;
      if (existing) {
        existing.feature = feature;
        if (outerMatch) {
          // 形状変化（穴追加など）→ レイヤー差し替え
          unbindPolygonHighlight(existing);
          if (existing.layer) { mapRef.removeLayer(existing.layer); existing.layer = null; }
          existing.layer = addPolygonToMap(feature);
          bindPolygonPopup(existing);
        }
        await updatePolygonInDB({ id: existing.id, feature, timestamp: existing.timestamp, name: existing.name, description: existing.description });
        nextArray.push(existing);
      } else {
        const layer = addPolygonToMap(feature);
        const id = await savePolygonToDB({ feature, timestamp, name: '', description: '' });
        const newRec = { id, feature, timestamp, name: '', description: '', layer };
        bindPolygonPopup(newRec);
        nextArray.push(newRec);
      }
    }
    polygonArray = nextArray;

    // oldKeysのMap化で漏れた重複レコード（孤立レイヤー/DBレコード）を確実に削除
    const nextIds = new Set(nextArray.map(r => r.id));
    for (const rec of allOldRecs) {
      if (!nextIds.has(rec.id)) {
        unbindPolygonHighlight(rec);
        if (rec.layer) { mapRef.removeLayer(rec.layer); rec.layer = null; }
        await deletePolygonFromDB(rec.id);
      }
    }

    renderDataList(mapRef, poiArray, lineArray, dataListOps);
  },
};

// ============================================================
// 公開API
// ============================================================
export function initPOIManager(map, positioning) {
  mapRef = map;
  // 保存された色を LINE_STYLE に反映（loadData より前に実行）
  setLineStyleColor(currentColor);
  const colorInput = document.getElementById('poi-color-picker');
  if (colorInput) {
    colorInput.value = currentColor;
    colorInput.addEventListener('input', e => applyColorToAll(e.target.value));
  }
  loadData(map);

  const saveBtnEl       = document.getElementById('saveBtn');
  const saveCenterBtnEl = document.getElementById('saveCenterBtn');

  saveBtnEl.onclick       = () => saveCurrentLocation(map, positioning);
  saveCenterBtnEl.onclick = () => saveMapCenterLocation(map, positioning);
  document.getElementById('allClearBtn').addEventListener('click', () => clearAllPOI(map));
  document.getElementById('line-undo-btn')?.addEventListener('click', () => {
    if (confirm('最後の点を取り消しますか？')) undoLastViaPoint();
  });
  document.getElementById('line-finish-btn')?.addEventListener('click', () => {
    if (confirm('ラインを完了しますか？')) endLineMode(map, null);
  });
  document.getElementById('toggleAllLabelsBtn')?.addEventListener('click', () => toggleAllLabels());
  document.querySelectorAll('input[name="labelMode"]').forEach(radio => {
    if (radio.value === globalLabelMode) radio.checked = true;
    radio.addEventListener('change', e => setGlobalLabelMode(e.target.value));
  });
  syncLabelUI();

  document.getElementById('sidebar-line-create-btn')?.addEventListener('click', () => {
    if (lineMode.active) return;
    pendingLineModeStart = true;
    updatePendingLineModeUI();
    document.querySelector('#sidebarMenu .btn-close')?.click();
  });
  document.getElementById('pending-line-cancel-btn')?.addEventListener('click', () => {
    pendingLineModeStart = false;
    updatePendingLineModeUI();
  });
  document.getElementById('sidebar-polygonize-btn')?.addEventListener('click', () => {
    dataListOps.polygonizeAllLines(lineArray);
  });

  document.getElementById('collapseDataList')
    ?.addEventListener('shown.bs.collapse', () => renderDataList(map, poiArray, lineArray, dataListOps));
}

export function getPOIArray()     { return poiArray; }
export function getLineArray()    { return lineArray; }
export function getPolygonArray() {
  return polygonArray.map(rec => ({
    ...rec.feature,
    properties: { ...(rec.feature?.properties ?? {}), timestamp: rec.timestamp || null },
  }));
}

// ============================================================
// IndexedDB — 読み込み / 保存
// ============================================================
async function loadData(map) {
  try {
    // DBから全データを取得（まだマップに追加しない）
    const savedPOIs = await loadAllPOI();
    poiArray = savedPOIs.map(poi => {
      if (typeof poi.timestamp === 'string') poi.timestamp = new Date(poi.timestamp);
      poi.stake_type  = typeof poi.stake_type  === 'string' ? poi.stake_type  : '';
      poi.number      = typeof poi.number      === 'number' && !isNaN(poi.number) ? poi.number : 0;
      poi.description = typeof poi.description === 'string' ? poi.description : '';
      return poi;
    });

    // localStorage → IndexedDB 移行（初回のみ）
    const legacyLines = localStorage.getItem(LINE_STORAGE_KEY);
    if (legacyLines) {
      try {
        const parsed = JSON.parse(legacyLines);
        if (parsed.length > 0) await saveAllLinesToDB(parsed);
      } catch (_) {}
      localStorage.removeItem(LINE_STORAGE_KEY);
    }
    const savedLines    = await loadAllLines();
    const savedPolygons = await loadAllPolygons();

    // 1. ポリゴンをマップに追加（最下層）
    polygonArray = savedPolygons.map(rec => {
      const result = { ...rec, layer: addPolygonToMap(rec.feature) };
      bindPolygonPopup(result);
      return result;
    });

    // 2. ラインをマップに追加（中間層）
    savedLines.forEach(line => {
      let latlngs;
      if (line.poiIds.length > 0) {
        latlngs = line.poiIds.map(id => poiArray.find(p => p.id === id)?.latlng).filter(Boolean);
      } else if (line.importedLatlngs?.length >= 2) {
        latlngs = line.importedLatlngs.map(p => L.latLng(p.lat, p.lng));
      }
      if (latlngs?.length >= 2) {
        const polyline = L.polyline(latlngs, LINE_STYLE).addTo(map);
        const entry = {
          id:               line.id,
          poiIds:           line.poiIds,
          vertices:         line.vertices?.length
            ? line.vertices
            : line.poiIds.map(id => ({ type: 'poi', poiId: id })),
          importedLatlngs:  line.importedLatlngs || null,
          polylineInstance: polyline,
          name:             line.name        || '',
          description:      line.description || '',
          timestamp:        line.timestamp   || null,
        };
        lineArray.push(entry);
        bindLinePopup(map, entry);
      }
    });

    // 3. POIマーカーをマップに追加（最上層）
    poiArray.forEach(poi => addMarker(map, poi));

    updateAllLabels();
    console.log(`POI: ${poiArray.length}件, ライン: ${lineArray.length}件, ポリゴン: ${polygonArray.length}件`);
  } catch (err) {
    console.error('データ読み込みエラー:', err);
    poiArray = [];
  }
}

async function savePOIArray() {
  try {
    await savePOIArrayToDB(poiArray);
  } catch (err) {
    console.error('POI保存エラー:', err);
  }
}

function saveLines() {
  saveAllLinesToDB(lineArray).catch(err => console.error('ライン保存エラー:', err));
}

// ============================================================
// マーカーアイコン & ポップアップ
// ============================================================
function createPoiIcon(color) {
  return L.divIcon({
    html: `<svg width="40" height="40" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="20" stroke="white" stroke-width="4" fill="${color}"/>
    </svg>`,
    className:   'custom-poi-icon',
    iconSize:    [40, 40],
    iconAnchor:  [10, 10],
    popupAnchor: [0, -10],
  });
}

/** POI・ラインの色を一括変更して localStorage に保存する */
function applyColorToAll(color) {
  currentColor = color;
  localStorage.setItem(POI_COLOR_KEY, color);
  setLineStyleColor(color);
  const icon = createPoiIcon(color);
  poiArray.forEach(poi => poi.markerInstance?.setIcon(icon));
  lineArray.forEach(l => l.polylineInstance?.setStyle({ color }));
  polygonArray.forEach(rec => rec.layer?.setStyle(makePolygonStyle(color)));
  if (lineMode.active && lineMode.polylineInstance) {
    lineMode.polylineInstance.setStyle({ color });
  }
}

function addMarker(map, poi, showPopup = false) {
  const marker = L.marker(poi.latlng, { icon: createPoiIcon(currentColor) })
    .addTo(map)
    .bindPopup(createPopupContent(poi));

  poi.markerInstance = marker;

  const objectURLs = [];

  function attachPopupListeners() {
    document.getElementById('edit-btn')?.addEventListener('click', () => editPOI(poi, marker));
    document.getElementById('delete-btn')?.addEventListener('click', () => {
      if (confirm('このマーカーを本当に削除しますか？')) deletePOI(map, poi, marker);
    });
    document.getElementById('line-start-btn')?.addEventListener('click', () => {
      startLineMode(map, poi);
      marker.closePopup();
    });
    document.getElementById('line-add-vertex-btn')?.addEventListener('click', () => {
      addVertexToLine(poi);
      marker.closePopup();
    });

    if (poi.photoId) {
      const imgEl  = document.getElementById('poi-photo-thumb');
      const dlBtn  = document.getElementById('photo-dl-btn');
      if (imgEl && !imgEl.getAttribute('src')) {
        getPhotoObjectURL(poi.photoId).then(url => {
          if (!url) return;
          objectURLs.push(url);
          imgEl.src          = url;
          imgEl.style.display = 'block';
          if (dlBtn) dlBtn.style.display = 'inline-block';
        });
      }
      dlBtn?.addEventListener('click', () => downloadPhotoWithExif(poi.photoId, poi));
    }
  }

  marker.on('popupopen', () => {
    if (pendingLineModeStart) {
      pendingLineModeStart = false;
      marker.closePopup();
      startLineMode(map, poi);
      updatePendingLineModeUI();
      return;
    }
    requestAnimationFrame(attachPopupListeners);
  });
  marker.on('popupclose', () => {
    objectURLs.forEach(u => URL.revokeObjectURL(u));
    objectURLs.length = 0;
  });
  if (showPopup) marker.openPopup();
}

function createPopupContent(poi) {
  const stake       = poi.stake_type  || '';
  const number      = poi.number      || 0;
  const description = poi.description || '';
  const date = poi.timestamp.toLocaleDateString();
  const time = poi.timestamp.toLocaleTimeString();

  const lineBtn = lineMode.active
    ? `<button id="line-add-vertex-btn" class="line-end-button">頂点として追加</button>`
    : `<button id="line-start-btn" class="line-start-button">ライン開始</button>`;

  const photoHtml = poi.photoId
    ? `<div class="photo-thumb-wrap" style="margin-top:6px">` +
        `<img id="poi-photo-thumb" src="" alt="写真" style="max-width:160px;border-radius:4px;display:none">` +
        `<br><button id="photo-dl-btn" class="btn btn-sm btn-outline-secondary mt-1" style="display:none">↓ 写真DL</button>` +
      `</div>`
    : '';

  return (
    `<div class="popup-content">` +
      `時間: ${date}_${time}<br>` +
      `測位: ${poi.positioning}<br>` +
      `番号: ${stake}${number}<br>` +
      `属性: ${description}` +
    `</div>` +
    `<div class="popup-buttons">` +
      `<button id="edit-btn"   class="edit-button">編集</button>` +
      `<button id="delete-btn" class="delete-button">削除</button>` +
    `</div>` +
    `<div style="margin-top:6px">${lineBtn}</div>` +
    photoHtml
  );
}

// ============================================================
// モーダル（POI）
// ============================================================
async function openPOIModal(title, defaultStake, defaultNumber, defaultDescription, existingPhotoId = null) {
  return new Promise((resolve) => {
    const modal = document.getElementById('poi-modal');
    if (!modal) { return resolve(null); }

    document.getElementById('modal-title').textContent   = title;
    document.getElementById('poi-stake-type').value      = defaultStake  || '';
    document.getElementById('poi-number').value          = defaultNumber != null ? String(defaultNumber) : '';
    document.getElementById('poi-description').value     = defaultDescription || '';

    const saveBtn   = document.getElementById('modal-save');
    const cancelBtn = document.getElementById('modal-cancel');
    const newSave   = saveBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    saveBtn.replaceWith(newSave);
    cancelBtn.replaceWith(newCancel);

    // カメラ関連
    const cameraBtn    = document.getElementById('modal-camera-btn');
    const photoInput   = document.getElementById('modal-photo-input');
    const photoPreview = document.getElementById('modal-photo-preview');
    let pendingFile    = null;
    let previewUrl     = null;

    photoInput.value = '';
    if (existingPhotoId) {
      getPhotoObjectURL(existingPhotoId).then(url => {
        if (!url) return;
        previewUrl             = url;
        photoPreview.src       = url;
        photoPreview.style.display = 'block';
      });
    } else {
      photoPreview.src           = '';
      photoPreview.style.display = 'none';
    }

    const onCameraClick = () => photoInput.click();
    const onPhotoChange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      pendingFile = file;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl             = URL.createObjectURL(file);
      photoPreview.src       = previewUrl;
      photoPreview.style.display = 'block';
    };
    cameraBtn.addEventListener('click', onCameraClick);
    photoInput.addEventListener('change', onPhotoChange);

    const close = () => {
      cameraBtn.removeEventListener('click', onCameraClick);
      photoInput.removeEventListener('change', onPhotoChange);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
      modal.style.display = 'none';
    };

    newSave.addEventListener('click', async () => {
      const newNumber = parseInt(document.getElementById('poi-number').value, 10);
      if (isNaN(newNumber) || newNumber < 0) {
        alert('有効な番号（0以上の数値）を入力してください。');
        return;
      }
      let photoId = existingPhotoId;
      if (pendingFile) photoId = await savePhotoToDB(pendingFile);
      close();
      resolve({
        stake_type:  document.getElementById('poi-stake-type').value.trim(),
        number:      newNumber,
        description: document.getElementById('poi-description').value.trim(),
        photoId:     photoId ?? null,
      });
    }, { once: true });

    newCancel.addEventListener('click', () => { close(); resolve(null); }, { once: true });
    modal.style.display = 'flex';
  });
}

// ============================================================
// POI操作
// ============================================================
function getLastStakeType() {
  return poiArray.length ? (poiArray.at(-1).stake_type || '') : '';
}
function getNextNumber() {
  return poiArray.length ? (poiArray.at(-1).number || 0) + 1 : 1;
}


async function registerPOI(map, poi) {
  poiArray.push(poi);
  addMarker(map, poi, false);
  updatePOILabel(poi);

  const inLineMode = lineMode.active && lineMode.polylineInstance;
  const capturedLineId = lineMode.lineId;
  if (inLineMode) {
    lineMode.polylineInstance.addLatLng(poi.latlng);
    poi.markerInstance?.setPopupContent(createPopupContent(poi));
  }

  await savePOIArray();

  if (inLineMode && lineMode.active && lineMode.lineId === capturedLineId) {
    lineMode.poiIds.push(poi.id);
    lineMode.vertices.push({ type: 'poi', poiId: poi.id });
    const entry = lineArray.find(l => l.id === capturedLineId);
    if (entry) {
      entry.poiIds   = [...lineMode.poiIds];
      entry.vertices = [...lineMode.vertices];
    }
    saveLines();
  }
}

async function saveCurrentLocation(map, positioning) {
  const marker = positioning.getCurrentLocationMarker();
  if (!marker) { alert('現在地が取得されていません。'); return; }
  const result = await openPOIModal('現在地を登録', getLastStakeType(), getNextNumber(), '');
  if (!result) return;
  await registerPOI(map, {
    latlng: marker.getLatLng(), timestamp: new Date(),
    positioning: 'Positioning-based', ...result,
  });
}

async function saveMapCenterLocation(map) {
  const result = await openPOIModal('画面中央を登録', getLastStakeType(), getNextNumber(), '');
  if (!result) return;
  await registerPOI(map, {
    latlng: map.getCenter(), timestamp: new Date(),
    positioning: 'map-center', ...result,
  });
}

async function editPOI(poi, marker) {
  const result = await openPOIModal('地点を編集', poi.stake_type, poi.number, poi.description, poi.photoId ?? null);
  if (!result) return;
  Object.assign(poi, {
    stake_type:  result.stake_type,
    number:      result.number,
    description: result.description,
    photoId:     result.photoId,
  });
  marker.setPopupContent(createPopupContent(poi));
  if (marker.isPopupOpen()) marker.openPopup();
  updatePOILabel(poi);
  await savePOIArray();
}

async function deletePOI(map, poi, marker) {
  const index = poiArray.indexOf(poi);
  if (index === -1) return;

  if (lineMode.active && lineMode.poiIds.includes(poi.id)) {
    const activeEntry = lineArray.find(l => l.id === lineMode.lineId);
    if (activeEntry?.polylineInstance) map.removeLayer(activeEntry.polylineInstance);
    lineArray = lineArray.filter(l => l.id !== lineMode.lineId);
    lineMode = { active: false, lineId: null, polylineInstance: null, poiIds: [], vertices: [] };
    updateLineModeUI();
  }

  lineArray.forEach(line => {
    const i = line.poiIds.indexOf(poi.id);
    if (i === -1) return;
    line.poiIds.splice(i, 1);
    if (line.vertices) {
      line.vertices = line.vertices.filter(v => !(v.type === 'poi' && v.poiId === poi.id));
    }
    const latlngs = line.poiIds
      .map(id => poiArray.find(p => p.id === id)?.latlng)
      .filter(Boolean);
    if (latlngs.length >= 2) {
      line.polylineInstance.setLatLngs(latlngs);
    } else {
      map.removeLayer(line.polylineInstance);
    }
  });
  lineArray = lineArray.filter(l => l.poiIds.length >= 2 || !map.hasLayer(l.polylineInstance));

  if (poi.labelTooltip) { map.removeLayer(poi.labelTooltip); poi.labelTooltip = null; }

  if (poi.photoId) await deletePhotoFromDB(poi.photoId).catch(() => {});
  if (poi.id) await deletePOIFromDB(poi.id);
  poiArray.splice(index, 1);
  map.removeLayer(marker);
  saveLines();
  await savePOIArray();
  refreshAllPopups();
}

async function clearAllPOI(map) {
  if (!confirm('すべてのデータを削除しますか？')) return;

  await clearAllPOIFromDB();
  await clearAllPolygonsFromDB();
  localStorage.removeItem(POI_STORAGE_KEY);
  localStorage.removeItem(LINE_STORAGE_KEY);

  poiArray.forEach(poi => {
    if (poi.markerInstance) map.removeLayer(poi.markerInstance);
    if (poi.labelTooltip)   map.removeLayer(poi.labelTooltip);
  });
  lineArray.forEach(l => { if (l.polylineInstance) map.removeLayer(l.polylineInstance); });
  polygonArray.forEach(rec => { if (rec.layer) map.removeLayer(rec.layer); });

  poiArray     = [];
  lineArray    = [];
  polygonArray = [];
  lineMode  = { active: false, lineId: null, polylineInstance: null, poiIds: [], vertices: [] };
  updateLineModeUI();
  alert('データが削除されました。');
}

// ============================================================
// ライン属性モーダル & 編集
// ============================================================
async function openLineModal(title, defaultName, defaultDescription, lengthStr) {
  return new Promise((resolve) => {
    const modal = document.getElementById('line-modal');
    if (!modal) { return resolve(null); }

    document.getElementById('line-modal-title').textContent = title;
    document.getElementById('line-name').value              = defaultName        || '';
    document.getElementById('line-description').value       = defaultDescription || '';
    document.getElementById('line-length-display').value    = lengthStr;

    const saveBtn   = document.getElementById('line-modal-save');
    const cancelBtn = document.getElementById('line-modal-cancel');
    const newSave   = saveBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    saveBtn.replaceWith(newSave);
    cancelBtn.replaceWith(newCancel);

    const close = () => { modal.style.display = 'none'; };

    newSave.addEventListener('click', () => {
      close();
      resolve({
        name:        document.getElementById('line-name').value.trim(),
        description: document.getElementById('line-description').value.trim(),
      });
    }, { once: true });

    newCancel.addEventListener('click', () => { close(); resolve(null); }, { once: true });
    modal.style.display = 'flex';
  });
}

async function editLine(map, line) {
  const lengthStr = formatLength(calcLineLength(getLineLatlngs(line, poiArray)));
  const result = await openLineModal('ライン編集', line.name, line.description, lengthStr);
  if (!result) return;
  line.name        = result.name;
  line.description = result.description;
  if (line.polylineInstance?.isPopupOpen()) {
    line.polylineInstance.setPopupContent(createLinePopupContent(line));
  }
  updateLineLabel(line);
  saveLines();
  renderDataList(map, poiArray, lineArray, dataListOps);
}

function formatArea(m2) {
  return `${(m2 / 10000).toFixed(4)} ha`;
}

async function openPolygonModal(defaultName, defaultDescription, areaStr) {
  return new Promise((resolve) => {
    const modal = document.getElementById('polygon-modal');
    if (!modal) { return resolve(null); }

    document.getElementById('polygon-name').value         = defaultName        || '';
    document.getElementById('polygon-description').value  = defaultDescription || '';
    document.getElementById('polygon-area-display').value = areaStr;

    const saveBtn   = document.getElementById('polygon-modal-save');
    const cancelBtn = document.getElementById('polygon-modal-cancel');
    const newSave   = saveBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    saveBtn.replaceWith(newSave);
    cancelBtn.replaceWith(newCancel);

    const close = () => { modal.style.display = 'none'; };

    newSave.addEventListener('click', () => {
      close();
      resolve({
        name:        document.getElementById('polygon-name').value.trim(),
        description: document.getElementById('polygon-description').value.trim(),
      });
    }, { once: true });

    newCancel.addEventListener('click', () => { close(); resolve(null); }, { once: true });
    modal.style.display = 'flex';
  });
}

async function editPolygon(rec) {
  const areaStr = rec.feature ? formatArea(turf.area(rec.feature)) : '';
  const result  = await openPolygonModal(rec.name, rec.description, areaStr);
  if (!result) return;
  rec.name        = result.name;
  rec.description = result.description;
  if (rec.feature) {
    rec.feature.properties = { ...(rec.feature.properties ?? {}), name: rec.name, description: rec.description };
  }
  await updatePolygonInDB({ id: rec.id, feature: rec.feature, timestamp: rec.timestamp, name: rec.name, description: rec.description });
  if (rec.layer) rec.layer.setPopupContent(createPolygonPopupContent(rec));
  updatePolygonLabel(rec);
  renderDataList(mapRef, poiArray, lineArray, dataListOps);
}

async function removeLineById(map, lineId) {
  const idx = lineArray.findIndex(l => l.id === lineId);
  if (idx === -1) return;
  const line = lineArray[idx];
  if (line.polylineInstance) map.removeLayer(line.polylineInstance);
  lineArray.splice(idx, 1);
  if (lineMode.lineId === lineId) {
    lineMode = { active: false, lineId: null, polylineInstance: null, poiIds: [], vertices: [] };
    updateLineModeUI();
    refreshAllPopups();
  }
  saveLines();
}

// ============================================================
// GeoJSONインポート（取り込みデータ → 登録データへのコピー）
// ============================================================
export function isLineModeActive() {
  return lineMode.active;
}

export async function addImportedPointVertex(latlng, properties) {
  if (!lineMode.active) return;
  const entry = lineArray.find(l => l.id === lineMode.lineId);
  if (!entry) return;

  const createPOI = confirm('この点をPOIとして登録しますか？');

  if (createPOI) {
    const nextNum = poiArray.length > 0
      ? Math.max(...poiArray.map(p => p.number || 0)) + 1 : 1;
    const desc = Object.entries(properties || {})
      .filter(([k, v]) => k !== '_fid' && v != null && v !== '')
      .map(([k, v]) => `${k}: ${v}`).join(', ');
    const poi = {
      latlng,
      stake_type:  '',
      number:      nextNum,
      description: desc,
      timestamp:   new Date(),
      positioning: 'imported',
    };
    poiArray.push(poi);
    addMarker(mapRef, poi, false);
    updatePOILabel(poi);
    await savePOIArray();

    lineMode.vertices.push({ type: 'poi', poiId: poi.id });
    lineMode.poiIds.push(poi.id);
  } else {
    lineMode.vertices.push({ type: 'latlng', lat: latlng.lat, lng: latlng.lng });
  }

  entry.vertices = [...lineMode.vertices];
  entry.poiIds   = lineMode.vertices.filter(v => v.type === 'poi').map(v => v.poiId);
  lineMode.polylineInstance.addLatLng(latlng);
  saveLines();
  refreshAllPopups();
}

export async function importGeoJSONFeatures(geojsonData, fieldMap) {
  const features = (geojsonData.features || []).filter(f => f.geometry);
  if (features.length === 0) return 0;

  let autoNum = poiArray.length ? (poiArray.at(-1).number ?? 0) + 1 : 1;
  let newPoiCount = 0;

  for (const feature of features) {
    const geom  = feature.geometry;
    const props = feature.properties || {};
    const stakeType = fieldMap.stakeType || '';
    const desc = fieldMap.descProp && props[fieldMap.descProp] != null
      ? String(props[fieldMap.descProp])
      : '';

    const makeNum = () => {
      if (fieldMap.numberProp && props[fieldMap.numberProp] != null) {
        const n = parseInt(props[fieldMap.numberProp], 10);
        return isNaN(n) ? autoNum++ : n;
      }
      return autoNum++;
    };

    const makePOI = (lng, lat) => {
      const poi = {
        latlng:      L.latLng(lat, lng),
        stake_type:  stakeType,
        number:      makeNum(),
        description: desc,
        timestamp:   new Date(),
        positioning: 'imported',
      };
      poiArray.push(poi);
      addMarker(mapRef, poi, false);
      updatePOILabel(poi);
      newPoiCount++;
      return poi;
    };

    if (geom.type === 'Point') {
      makePOI(geom.coordinates[0], geom.coordinates[1]);
    } else if (geom.type === 'MultiPoint') {
      for (const [lng, lat] of geom.coordinates) makePOI(lng, lat);
    }
  }

  await savePOIArray();
  saveLines();
  renderDataList(mapRef, poiArray, lineArray, dataListOps);
  return newPoiCount;
}
