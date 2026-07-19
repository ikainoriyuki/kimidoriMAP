import L from 'leaflet';
import { getLineLatlngs, calcLineLength, formatLength } from './distance_calc.js';
import { initVertexEditModule, startVertexEdit, isVertexEditActive } from './vertex_edit.js';
export { isVertexEditActive } from './vertex_edit.js';

// ============================================================
// ラインモード
// ============================================================

export const LINE_STYLE = { color: '#004926', weight: 2.5, opacity: 0.9 };

/** ライン色を一括変更する（LINE_STYLE を更新するだけ — 既存ポリラインは呼び出し元で setStyle する） */
export function setLineStyleColor(color) {
  LINE_STYLE.color = color;
}

/**
 * poi_manager.js から initLineModeModule(ctx) を呼んで状態を登録する。
 *
 * ctx が持つもの:
 *   - lineMode    : get / set
 *   - lineArray   : get / set
 *   - poiArray    : get
 *   - mapRef      : get
 *   - savePOIArray()
 *   - saveLines()
 *   - deletePOIFromDB(id)
 *   - createPopupContent(poi)   ← POI ポップアップHTML生成（poi_manager内）
 *   - updatePOILabel(poi)       ← label_system
 *   - renderDataList(map)       ← data_list_ui ラッパー
 *   - editLine(map, line)
 *   - removeLineById(map, id)
 */
let _ctx = null;
export function initLineModeModule(ctx) {
  _ctx = ctx;
  initVertexEditModule(ctx);
}

// ============================================================
// ラインポップアップ
// ============================================================
export function createLinePopupContent(line) {
  const vertices = line.vertices || line.poiIds.map(id => ({ type: 'poi', poiId: id }));
  const pts = vertices
    .filter(v => v.type === 'poi')
    .map(v => _ctx.poiArray.find(p => p.id === v.poiId))
    .filter(Boolean);
  const totalCount = vertices.length;
  const autoLabel = pts.length >= 2
    ? `${pts[0].stake_type || ''}${pts[0].number} → ${pts.at(-1).stake_type || ''}${pts.at(-1).number}`
    : pts.length === 1
      ? `${pts[0].stake_type || ''}${pts[0].number}〜（${totalCount}点）`
      : `ライン（${totalCount}点）`;
  const displayName = line.name || autoLabel;
  const lengthStr   = formatLength(calcLineLength(getLineLatlngs(line, _ctx.poiArray)));

  return (
    `<div class="popup-content">` +
      `名前: ${displayName}<br>` +
      `延長: ${lengthStr}<br>` +
      (line.description ? `説明: ${line.description}` : '') +
    `</div><br>` +
    `<button id="line-edit-popup-btn"        class="edit-button">編集</button> ` +
    `<button id="line-vertex-edit-popup-btn" class="line-vertex-edit-button">頂点編集</button> ` +
    `<button id="line-delete-popup-btn"      class="delete-button">削除</button>`
  );
}

export function bindLinePopup(map, entry) {
  const polyline = entry.polylineInstance;
  polyline.bindPopup(() => createLinePopupContent(entry));
  polyline.on('popupopen', () => {
    requestAnimationFrame(() => {
      document.getElementById('line-edit-popup-btn')?.addEventListener('click', () => {
        polyline.closePopup();
        _ctx.editLine(map, entry);
      });
      document.getElementById('line-vertex-edit-popup-btn')?.addEventListener('click', () => {
        polyline.closePopup();
        startVertexEdit(map, entry);
      });
      document.getElementById('line-delete-popup-btn')?.addEventListener('click', () => {
        const label = entry.name || `ライン`;
        if (confirm(`「${label}」を削除しますか？`)) {
          polyline.closePopup();
          _ctx.removeLineById(map, entry.id).then(() => _ctx.renderDataList(map));
        }
      });
    });
  });
  map.on('popupopen',  e => { if (e.popup._source === polyline) polyline.setStyle({ color: '#ff8c00', weight: 4, opacity: 1 }); });
  map.on('popupclose', e => { if (e.popup._source === polyline) polyline.setStyle(LINE_STYLE); });
}

// ============================================================
// ライン描画の開始 / 終了 / 取り消し
// ============================================================
export function startLineMode(map, poi) {
  if (isVertexEditActive() || _ctx.isPolygonVertexEditActive?.()) {
    alert('頂点編集中はライン記録を開始できません。');
    return;
  }
  const lineId   = `line_${Date.now()}`;
  const polyline = L.polyline([poi.latlng], LINE_STYLE).addTo(map);
  const initVertex = { type: 'poi', poiId: poi.id };
  const entry    = { id: lineId, poiIds: [poi.id], vertices: [initVertex], polylineInstance: polyline, name: '', description: '', timestamp: new Date().toISOString() };
  _ctx.lineArray.push(entry);

  _ctx.lineMode = {
    active:          true,
    lineId,
    polylineInstance: polyline,
    poiIds:          [poi.id],
    vertices:        [initVertex],
  };

  refreshAllPopups();
  updateLineModeUI();
  _ctx.saveLines();
}

export function addVertexToLine(poi) {
  if (!_ctx.lineMode.active) return;
  const lastVertex = _ctx.lineMode.vertices.at(-1);
  const isAlreadyLast = lastVertex?.type === 'poi' && lastVertex.poiId === poi.id;
  if (isAlreadyLast) return;

  _ctx.lineMode.polylineInstance.addLatLng(poi.latlng);
  _ctx.lineMode.poiIds.push(poi.id);
  _ctx.lineMode.vertices.push({ type: 'poi', poiId: poi.id });

  const entry = _ctx.lineArray.find(l => l.id === _ctx.lineMode.lineId);
  if (entry) {
    entry.poiIds   = [..._ctx.lineMode.poiIds];
    entry.vertices = [..._ctx.lineMode.vertices];
  }
  _ctx.saveLines();
}

export function endLineMode(map, poi) {
  if (!_ctx.lineMode.active) return;

  const lastVertex = _ctx.lineMode.vertices.at(-1);
  const isAlreadyLast = lastVertex?.type === 'poi' && lastVertex.poiId === poi?.id;
  if (poi && !isAlreadyLast) {
    _ctx.lineMode.polylineInstance.addLatLng(poi.latlng);
    _ctx.lineMode.poiIds.push(poi.id);
    _ctx.lineMode.vertices.push({ type: 'poi', poiId: poi.id });

    const entry = _ctx.lineArray.find(l => l.id === _ctx.lineMode.lineId);
    if (entry) {
      entry.poiIds   = [..._ctx.lineMode.poiIds];
      entry.vertices = [..._ctx.lineMode.vertices];
    }
  }

  const finalEntry = _ctx.lineArray.find(l => l.id === _ctx.lineMode.lineId);
  _ctx.lineMode = { active: false, lineId: null, polylineInstance: null, poiIds: [], vertices: [] };
  if (finalEntry && finalEntry.vertices?.length >= 2) bindLinePopup(map, finalEntry);
  refreshAllPopups();
  updateLineModeUI();
  _ctx.saveLines();
}

export async function undoLastViaPoint() {
  if (!_ctx.lineMode.active || !_ctx.lineMode.polylineInstance) return;
  if (_ctx.lineMode.vertices.length <= 1) return;

  const removed = _ctx.lineMode.vertices.pop();

  if (removed.type === 'poi') {
    _ctx.lineMode.poiIds = _ctx.lineMode.vertices
      .filter(v => v.type === 'poi').map(v => v.poiId);
  }

  const entry = _ctx.lineArray.find(l => l.id === _ctx.lineMode.lineId);
  if (entry) {
    entry.vertices = [..._ctx.lineMode.vertices];
    entry.poiIds   = [..._ctx.lineMode.poiIds];
  }

  const latlngs = _ctx.lineMode.vertices.map(v => {
    if (v.type === 'poi') return _ctx.poiArray.find(p => p.id === v.poiId)?.latlng;
    return L.latLng(v.lat, v.lng);
  }).filter(Boolean);
  _ctx.lineMode.polylineInstance.setLatLngs(latlngs);

  if (removed.type === 'poi') {
    const poiIndex = _ctx.poiArray.findIndex(p => p.id === removed.poiId);
    if (poiIndex !== -1) {
      const poi = _ctx.poiArray[poiIndex];
      if (poi.labelTooltip) { _ctx.mapRef.removeLayer(poi.labelTooltip); poi.labelTooltip = null; }
      if (poi.markerInstance) _ctx.mapRef.removeLayer(poi.markerInstance);
      if (poi.id) await _ctx.deletePOIFromDB(poi.id);
      _ctx.poiArray.splice(poiIndex, 1);
      await _ctx.savePOIArray();
    }
  }

  _ctx.saveLines();
  refreshAllPopups();
}

export function updateLineModeUI() {
  const indicator = document.getElementById('line-mode-indicator');
  if (indicator) indicator.style.display = _ctx.lineMode.active ? 'inline-flex' : 'none';
  const hint = document.getElementById('line-mode-hint');
  if (hint) hint.style.display = _ctx.lineMode.active ? 'block' : 'none';
}

/** 全POIポップアップをlineModeに合わせて再生成し、データ一覧も更新 */
export function refreshAllPopups() {
  _ctx.poiArray.forEach(poi => {
    poi.markerInstance?.setPopupContent(_ctx.createPopupContent(poi));
  });
  const listPanel = document.getElementById('collapseDataList');
  if (listPanel?.classList.contains('show')) {
    _ctx.renderDataList(_ctx.mapRef);
  }
}
