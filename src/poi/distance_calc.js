import L from 'leaflet';
import * as turf from '@turf/turf';

// ============================================================
// 延長計算
// ============================================================

/**
 * ラインエントリから latlng 配列を返す。
 * poiIds があれば poiArray から、なければ importedLatlngs から取得。
 * @param {object} line - ラインエントリ
 * @param {Array} poiArray - POI配列
 */
export function getLineLatlngs(line, poiArray) {
  if (line.vertices?.length > 0) {
    return line.vertices.map(v => {
      if (v.type === 'poi') return poiArray.find(p => p.id === v.poiId)?.latlng;
      return L.latLng(v.lat, v.lng);
    }).filter(Boolean);
  }
  if (line.poiIds.length > 0) {
    return line.poiIds.map(id => poiArray.find(p => p.id === id)?.latlng).filter(Boolean);
  }
  if (line.importedLatlngs?.length > 0) {
    return line.importedLatlngs.map(p => L.latLng(p.lat, p.lng));
  }
  return line.polylineInstance?.getLatLngs() || [];
}

/** latlng 配列から隣接する2点間の距離を turf.distance で積算して返す（メートル） */
export function calcLineLength(latlngs) {
  if (latlngs.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < latlngs.length; i++) {
    const from = turf.point([latlngs[i - 1].lng, latlngs[i - 1].lat]);
    const to   = turf.point([latlngs[i].lng,     latlngs[i].lat]);
    total += turf.distance(from, to, { units: 'meters' });
  }
  return total;
}

/** メートル値を見やすい文字列に変換 */
export function formatLength(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(3)} km`;
  return `${meters.toFixed(1)} m`;
}
