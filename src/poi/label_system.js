import L from 'leaflet';

// ============================================================
// POI ラベルシステム
// ============================================================

/**
 * poi_manager.js から initLabelSystem(ctx) を呼んで状態を登録する。
 *
 * ctx が持つもの:
 *   - labelsVisible    : get / set
 *   - globalLabelMode  : get / set
 *   - poiArray         : get
 *   - lineArray        : get
 *   - polygonArray     : get
 *   - mapRef           : get
 */
let _ctx = null;
export function initLabelSystem(ctx) { _ctx = ctx; }

/** poi のラベルを更新（グローバル設定に従って付け外しする） */
export function updatePOILabel(poi) {
  if (poi.labelTooltip) {
    _ctx.mapRef.removeLayer(poi.labelTooltip);
    poi.labelTooltip = null;
  }
  if (!_ctx.labelsVisible) return;

  let text;
  if (_ctx.globalLabelMode === 'number') {
    text = `${poi.stake_type || ''}${poi.number ?? ''}`;
  } else if (_ctx.globalLabelMode === 'datetime') {
    const ts = poi.timestamp instanceof Date ? poi.timestamp : new Date(poi.timestamp);
    text = isNaN(ts) ? '' : `${ts.toLocaleDateString('ja-JP')} ${ts.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    text = poi.description || '';
  }
  if (!text.trim()) return;

  poi.labelTooltip = L.tooltip({
    permanent:  true,
    direction:  'right',
    className:  'my-label-tooltip',
  }).setContent(text).setLatLng(poi.latlng).addTo(_ctx.mapRef);
}

/** ラインのラベルを更新（名前が入力されていればライン中央に表示） */
export function updateLineLabel(line) {
  if (!line.polylineInstance) return;
  line.polylineInstance.unbindTooltip();
  if (!_ctx.labelsVisible || !line.name?.trim()) return;
  line.polylineInstance.bindTooltip(line.name.trim(), {
    permanent:  true,
    className:  'my-label-tooltip',
    sticky:     false,
  });
}

/** ポリゴンのラベルを更新（名前が入力されていれば重心付近に表示） */
export function updatePolygonLabel(rec) {
  if (!rec.layer) return;
  rec.layer.unbindTooltip();
  if (!_ctx.labelsVisible || !rec.name?.trim()) return;
  rec.layer.bindTooltip(rec.name.trim(), {
    permanent:  true,
    className:  'my-label-tooltip',
    sticky:     false,
  });
}

/** 全POIのラベルを一括再描画 */
export function updateAllLabels() {
  _ctx.poiArray.forEach(poi => updatePOILabel(poi));
  _ctx.lineArray?.forEach(line => updateLineLabel(line));
  _ctx.polygonArray?.forEach(rec => updatePolygonLabel(rec));
}

/** ボタンUIをグローバル状態に同期 */
export function syncLabelUI() {
  const btn = document.getElementById('toggleAllLabelsBtn');
  if (btn) {
    btn.classList.toggle('active', _ctx.labelsVisible);
    btn.title = _ctx.labelsVisible ? '全ラベルを非表示' : '全ラベルを表示';
  }
  document.querySelectorAll('input[name="labelMode"]').forEach(radio => {
    radio.checked = radio.value === _ctx.globalLabelMode;
  });
}

/** 全ラベルの表示・非表示を切り替え */
export function toggleAllLabels() {
  _ctx.labelsVisible = !_ctx.labelsVisible;
  localStorage.setItem('labelsVisible', _ctx.labelsVisible);
  updateAllLabels();
  syncLabelUI();
}

/** ラベル種別（番号／属性）をグローバルに切り替え */
export function setGlobalLabelMode(mode) {
  _ctx.globalLabelMode = mode;
  localStorage.setItem('globalLabelMode', mode);
  if (_ctx.labelsVisible) updateAllLabels();
  syncLabelUI();
}
