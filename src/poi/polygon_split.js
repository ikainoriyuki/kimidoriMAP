import L from 'leaflet';
import * as turf from '@turf/turf';
import { showToast } from '../utils.js';

let _map          = null;
let _ctx          = null;
let _active       = false;
let _targetRec    = null;
let _lineHandlers = [];
let _callbacks    = {};

export function initPolygonSplitModule(ctx) { _ctx = ctx; }
export function isSplitModeActive() { return _active; }

export function startPolygonSplitMode(map, rec, lineArray, { onSplitComplete, onCancel } = {}) {
  if (_ctx.isPolygonVertexEditActive?.()) { showToast('頂点編集中は分割できません。'); return; }
  if (_ctx.lineMode?.active)             { showToast('ライン記録中は分割できません。'); return; }
  if (_active) cancelSplitMode();

  _map = map; _targetRec = rec; _callbacks = { onSplitComplete, onCancel };

  const indicator = document.getElementById('split-mode-indicator');
  indicator.style.display = 'inline-flex';
  document.getElementById('split-cancel-btn').addEventListener('click', cancelSplitMode, { once: true });

  for (const line of lineArray) {
    if (!line.polylineInstance) continue;
    const handler = (e) => {
      L.DomEvent.stopPropagation(e);
      _onLineSelected(line);
    };
    line.polylineInstance.on('click', handler);
    _lineHandlers.push({ inst: line.polylineInstance, handler });
  }

  _active = true;
  showToast('分割に使うラインをクリックしてください');
}

async function _onLineSelected(line) {
  const lineName = line.name || 'このライン';
  if (!confirm(`「${lineName}」でポリゴンを分割しますか？`)) return;

  const latlngs = _ctx.getLineLatlngs(line);
  if (!latlngs || latlngs.length < 2) {
    alert('ラインの座標が取得できません。');
    return;
  }

  const halves = splitPolygonGeometry(_targetRec.feature, latlngs);
  if (!halves) return;

  const baseName = _targetRec.name || '';
  const oldRecId = _targetRec.id;
  const onSplitComplete = _callbacks.onSplitComplete;
  _cleanup();

  onSplitComplete?.([
    { feature: halves[0], name: baseName ? `${baseName} (1)` : '', description: '' },
    { feature: halves[1], name: baseName ? `${baseName} (2)` : '', description: '' },
  ], oldRecId);
}

export function cancelSplitMode() { _cleanup(); _callbacks.onCancel?.(); }

function _cleanup() {
  for (const { inst, handler } of _lineHandlers) inst.off('click', handler);
  _lineHandlers = [];
  const indicator = document.getElementById('split-mode-indicator');
  if (indicator) indicator.style.display = 'none';
  _map = null; _targetRec = null; _callbacks = {}; _active = false;
}

function splitPolygonGeometry(polygonFeature, latlngs) {
  const splitterCoords = latlngs.map(ll => [ll.lng, ll.lat]);
  const splitter = turf.lineString(splitterCoords);

  const ring = turf.polygonToLine(polygonFeature);
  const exteriorLine = ring.type === 'FeatureCollection' ? ring.features[0] : ring;

  const intersections = turf.lineIntersect(exteriorLine, splitter);
  if (intersections.features.length < 2) {
    alert('選択したラインがポリゴンの境界と2箇所以上交差していません。\n別のラインを選択してください。');
    return null;
  }

  const snapped = intersections.features.map(pt => {
    const s = turf.nearestPointOnLine(exteriorLine, pt, { units: 'kilometers' });
    return { coord: s.geometry.coordinates, loc: s.properties.location, index: s.properties.index };
  });
  snapped.sort((a, b) => a.loc - b.loc);
  const [snap0, snap1] = snapped;

  if (snap0.index === snap1.index && Math.abs(snap0.loc - snap1.loc) < 1e-9) {
    alert('分割線の交差点が同一点です。別のラインを選択してください。');
    return null;
  }

  const ringCoords = exteriorLine.geometry.coordinates;
  const n = ringCoords.length - 1;

  function walkRing(startIdx, endIdx) {
    const result = [];
    let i = startIdx;
    while (i !== endIdx) { result.push(ringCoords[i % n]); i = (i + 1) % n; }
    return result;
  }

  const afterSnap0 = (snap0.index + 1) % n;
  const afterSnap1 = (snap1.index + 1) % n;
  const splitterInterior = splitterCoords.slice(1, -1);

  const half1Coords = [snap0.coord, ...walkRing(afterSnap0, afterSnap1), snap1.coord, ...[...splitterInterior].reverse(), snap0.coord];
  const half2Coords = [snap1.coord, ...walkRing(afterSnap1, afterSnap0), snap0.coord, ...splitterInterior, snap1.coord];

  if (half1Coords.length < 4 || half2Coords.length < 4) {
    alert('分割結果のポリゴンが不正です（頂点不足）。');
    return null;
  }

  const baseProps = { ...(polygonFeature.properties ?? {}) };
  const half1Feature = turf.polygon([half1Coords], baseProps);
  const half2Feature = turf.polygon([half2Coords], baseProps);

  if (turf.area(half1Feature) < 1 || turf.area(half2Feature) < 1) {
    alert('分割結果のポリゴンが有効な面積を持ちません。別のラインを選択してください。');
    return null;
  }

  return [half1Feature, half2Feature];
}
