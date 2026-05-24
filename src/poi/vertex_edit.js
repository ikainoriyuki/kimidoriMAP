import L from 'leaflet';
import { showToast } from '../utils.js';

// ============================================================
// 完成済みラインの頂点編集（移動・削除）
// ============================================================
// 移動先は既存POI（杭）の位置のみ。任意座標へのドラッグ不可。

let _ctx              = null;
let _editingEntry     = null;
let _originalLatlngs  = null;  // cancel用スナップショット
let _originalVertices = null;  // cancel用スナップショット
let _vertexMarkers    = [];    // L.marker 配列
let _selectedIndex    = null;  // 移動モードで選択中の頂点インデックス
let _insertionIndex   = null;  // 挿入モードで選択中のセグメントインデックス
let _midpointMarkers  = [];    // 挿入モードの中間マーカー配列
let _editMode         = 'move'; // 'move' | 'delete' | 'insert'
let _isEditing        = false;
let _map              = null;
// POIクリックハンドラを poi.id → 関数 で管理（Leafletは名前空間イベント非対応）
const _poiHandlers    = new Map();

const COLOR_NORMAL      = '#7b5ea7';
const COLOR_SELECTED    = '#f0c040';
const COLOR_MIDPOINT    = '#e06030';
const COLOR_MIDPOINT_SEL = '#f0c040';

function _makeMidpointIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;transform:rotate(45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
    iconSize:   [14, 14],
    iconAnchor: [7, 7],
  });
}

function _makeVertexIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
    iconSize:   [20, 20],
    iconAnchor: [10, 10],
  });
}

export function initVertexEditModule(ctx) {
  _ctx = ctx;
  document.getElementById('vertex-edit-commit-btn')
    ?.addEventListener('click', commitVertexEdit);
  document.getElementById('vertex-edit-cancel-btn')
    ?.addEventListener('click', cancelVertexEdit);
  document.getElementById('vertex-edit-move-btn')
    ?.addEventListener('click', () => _setEditMode('move'));
  document.getElementById('vertex-edit-delete-btn')
    ?.addEventListener('click', () => _setEditMode('delete'));
  document.getElementById('vertex-edit-insert-btn')
    ?.addEventListener('click', () => _setEditMode('insert'));
}

export function isVertexEditActive() { return _isEditing; }

export function startVertexEdit(map, entry) {
  if (_ctx.lineMode.active) {
    alert('ライン記録中は頂点編集できません。');
    return;
  }
  if (_ctx.isPolygonVertexEditActive?.()) {
    alert('ポリゴン頂点編集中はライン頂点編集を開始できません。');
    return;
  }
  if (_isEditing) cancelVertexEdit();

  _map          = map;
  _editingEntry = entry;
  _originalLatlngs  = entry.polylineInstance.getLatLngs().map(ll => L.latLng(ll.lat, ll.lng));
  _originalVertices = entry.vertices.map(v => ({ ...v }));
  _editMode     = 'move';
  _selectedIndex = null;

  _buildVertexMarkers();
  _patchPOIClickHandlers();

  showToast('頂点を削除または既存の頂点に移動、挿入できます');

  const indicator = document.getElementById('vertex-edit-indicator');
  if (indicator) indicator.style.display = 'inline-flex';
  document.getElementById('vertex-edit-move-btn')?.classList.add('active');
  document.getElementById('vertex-edit-delete-btn')?.classList.remove('active');
  document.getElementById('vertex-edit-insert-btn')?.classList.remove('active');
  _isEditing = true;
}

// ============================================================
// 頂点マーカー管理
// ============================================================

function _buildVertexMarkers() {
  _removeVertexMarkers();
  _editingEntry.polylineInstance.getLatLngs().forEach((ll, i) => {
    const m = L.marker(ll, {
      icon:          _makeVertexIcon(COLOR_NORMAL),
      zIndexOffset:  9000,
      interactive:   true,
    })
      .addTo(_map)
      .on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        _onVertexClick(i);
      });
    _vertexMarkers.push(m);
  });
}

function _removeVertexMarkers() {
  _vertexMarkers.forEach(m => _map?.removeLayer(m));
  _vertexMarkers = [];
}

function _buildMidpointMarkers() {
  _removeMidpointMarkers();
  const latlngs = _editingEntry.polylineInstance.getLatLngs();
  for (let i = 0; i < latlngs.length - 1; i++) {
    const mid = L.latLng(
      (latlngs[i].lat + latlngs[i + 1].lat) / 2,
      (latlngs[i].lng + latlngs[i + 1].lng) / 2,
    );
    const m = L.marker(mid, {
      icon:         _makeMidpointIcon(COLOR_MIDPOINT),
      zIndexOffset: 8000,
      interactive:  true,
    })
      .addTo(_map)
      .on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        _onMidpointClick(i);
      });
    _midpointMarkers.push(m);
  }
}

function _removeMidpointMarkers() {
  _midpointMarkers.forEach(m => _map?.removeLayer(m));
  _midpointMarkers = [];
}

function _onMidpointClick(index) {
  _midpointMarkers.forEach((m, i) =>
    m.setIcon(_makeMidpointIcon(i === index ? COLOR_MIDPOINT_SEL : COLOR_MIDPOINT))
  );
  _insertionIndex = index;
}

function _insertVertexAtPOI(segIndex, poi) {
  _editingEntry.vertices.splice(segIndex + 1, 0, { type: 'poi', poiId: poi.id });

  const latlngs = _editingEntry.polylineInstance.getLatLngs();
  latlngs.splice(segIndex + 1, 0, L.latLng(poi.latlng.lat, poi.latlng.lng));
  _editingEntry.polylineInstance.setLatLngs(latlngs);

  _insertionIndex = null;
  _buildVertexMarkers();
  _buildMidpointMarkers();
}

// ============================================================
// 頂点クリック処理
// ============================================================

function _onVertexClick(index) {
  if (_editMode === 'delete') {
    _deleteVertex(index);
  } else {
    if (_selectedIndex === index) {
      _selectedIndex = null;
      _vertexMarkers[index]?.setIcon(_makeVertexIcon(COLOR_NORMAL));
    } else {
      if (_selectedIndex !== null) {
        _vertexMarkers[_selectedIndex]?.setIcon(_makeVertexIcon(COLOR_NORMAL));
      }
      _selectedIndex = index;
      _vertexMarkers[index]?.setIcon(_makeVertexIcon(COLOR_SELECTED));
    }
  }
}

function _deleteVertex(index) {
  const latlngs = _editingEntry.polylineInstance.getLatLngs();
  if (latlngs.length <= 2) {
    alert('頂点は最低2点必要です。');
    return;
  }
  _editingEntry.vertices.splice(index, 1);
  latlngs.splice(index, 1);
  _editingEntry.polylineInstance.setLatLngs(latlngs);
  _buildVertexMarkers();
  _selectedIndex = null;
}

// ============================================================
// POIクリックへの割り込み（移動モード）
// ============================================================

function _patchPOIClickHandlers() {
  _ctx.poiArray.forEach(poi => {
    if (!poi.markerInstance) return;
    poi.markerInstance.unbindPopup();
    const handler = (e) => {
      L.DomEvent.stopPropagation(e);
      if (_editMode === 'move' && _selectedIndex !== null) {
        _moveVertexToPOI(_selectedIndex, poi);
      } else if (_editMode === 'insert' && _insertionIndex !== null) {
        _insertVertexAtPOI(_insertionIndex, poi);
      }
    };
    _poiHandlers.set(poi.id, handler);
    poi.markerInstance.on('click', handler);
  });
}

function _unpatchPOIClickHandlers() {
  _ctx.poiArray.forEach(poi => {
    if (!poi.markerInstance) return;
    const handler = _poiHandlers.get(poi.id);
    if (handler) poi.markerInstance.off('click', handler);
    poi.markerInstance.bindPopup(() => _ctx.createPopupContent(poi));
  });
  _poiHandlers.clear();
}

function _moveVertexToPOI(index, poi) {
  _editingEntry.vertices[index] = { type: 'poi', poiId: poi.id };

  const latlngs = _editingEntry.polylineInstance.getLatLngs();
  latlngs[index] = L.latLng(poi.latlng.lat, poi.latlng.lng);
  _editingEntry.polylineInstance.setLatLngs(latlngs);

  _vertexMarkers[index]?.setLatLng(poi.latlng);
  _vertexMarkers[index]?.setIcon(_makeVertexIcon(COLOR_NORMAL));
  _selectedIndex = null;
}

// ============================================================
// モード切替
// ============================================================

function _setEditMode(mode) {
  if (!_isEditing) return;
  if (_editMode === 'insert' && mode !== 'insert') _removeMidpointMarkers();
  _editMode      = mode;
  _selectedIndex = null;
  _insertionIndex = null;
  _vertexMarkers.forEach(m => m.setIcon(_makeVertexIcon(COLOR_NORMAL)));
  document.getElementById('vertex-edit-move-btn')
    ?.classList.toggle('active', mode === 'move');
  document.getElementById('vertex-edit-delete-btn')
    ?.classList.toggle('active', mode === 'delete');
  document.getElementById('vertex-edit-insert-btn')
    ?.classList.toggle('active', mode === 'insert');
  if (mode === 'insert') _buildMidpointMarkers();
}

// ============================================================
// 編集完了 / キャンセル
// ============================================================

export function commitVertexEdit() {
  if (!_editingEntry) return;
  _unpatchPOIClickHandlers();
  _removeVertexMarkers();
  _removeMidpointMarkers();

  _editingEntry.poiIds = _editingEntry.vertices
    .filter(v => v.type === 'poi').map(v => v.poiId);

  _ctx.saveLines();
  _ctx.renderDataList(_ctx.mapRef);
  _hideIndicator();
  _reset();
}

export function cancelVertexEdit() {
  if (!_editingEntry) return;
  _unpatchPOIClickHandlers();
  _removeVertexMarkers();
  _removeMidpointMarkers();

  _editingEntry.polylineInstance.setLatLngs(_originalLatlngs);
  _editingEntry.vertices = _originalVertices.map(v => ({ ...v }));
  _editingEntry.poiIds   = _originalVertices.filter(v => v.type === 'poi').map(v => v.poiId);

  _hideIndicator();
  _reset();
}

function _hideIndicator() {
  const indicator = document.getElementById('vertex-edit-indicator');
  if (indicator) indicator.style.display = 'none';
}

function _reset() {
  _editingEntry = null; _originalLatlngs = null; _originalVertices = null;
  _selectedIndex = null; _insertionIndex = null; _isEditing = false; _map = null;
}
