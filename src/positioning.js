import { updateElevation } from './utils.js';

// ============================================================
// positioning.js — 現在地の測位と座標・標高の表示
// ============================================================

export function initPositioning(map) {
  // --- DOM参照 ---
  const el = {
    currentLat:          document.getElementById('currentLat'),
    currentLng:          document.getElementById('currentLng'),
    currentElevation:    document.getElementById('currentElevation'),
    mapCenterLat:        document.getElementById('mapCenterLat'),
    mapCenterLng:        document.getElementById('mapCenterLng'),
    mapCenterElevation:  document.getElementById('mapCenterElevation'),
    distance:            document.getElementById('distance'),
    elevationDiff:       document.getElementById('elevationDifference'),
    slopeDegree:         document.getElementById('slopeDegree'),
    locationBtn:         document.getElementById('currentLocationControl'),
  };

  // --- 状態 ---
  // elevation: undefined=未取得, null=取得失敗/N/A, number=成功
  let currentLocation    = null; // { lat, lng, elevation }
  let mapCenterLocation  = null;
  let locationMarker     = null;
  let accuracyCircle     = null;

  // ============================================================
  // 距離の更新（lat/lng のみで計算、オフラインでも動作）
  // ============================================================
  function updateDistance() {
    if (!currentLocation || !mapCenterLocation) return;
    const dist = L.latLng(currentLocation.lat, currentLocation.lng)
                  .distanceTo(L.latLng(mapCenterLocation.lat, mapCenterLocation.lng));
    el.distance.textContent = `${dist.toFixed(0)} m`;
  }

  // ============================================================
  // 標高差・傾斜角の更新（標高 API 応答後に呼ぶ）
  // ============================================================
  function updateCalculations() {
    const ce = currentLocation?.elevation;
    const me = mapCenterLocation?.elevation;
    if (ce === undefined || me === undefined) return; // まだ取得中
    if (ce === null || me === null) {
      el.elevationDiff.textContent = 'Error';
      el.slopeDegree.textContent   = 'Error';
      return;
    }
    const dist = L.latLng(currentLocation.lat, currentLocation.lng)
                  .distanceTo(L.latLng(mapCenterLocation.lat, mapCenterLocation.lng));
    const dh   = me - ce;
    const deg  = dist > 0 ? Math.atan(dh / dist) * (180 / Math.PI) : 0;
    el.elevationDiff.textContent = `${dh.toFixed(0)} m`;
    el.slopeDegree.textContent   = `${deg.toFixed(0)} °`;
  }

  // ============================================================
  // 画面中央の座標更新（地図移動時）
  // ============================================================
  function updateMapCenter() {
    const center = map.getCenter();
    mapCenterLocation = { lat: center.lat, lng: center.lng, elevation: undefined };
    el.mapCenterLat.textContent = center.lat.toFixed(5);
    el.mapCenterLng.textContent = center.lng.toFixed(5);
    updateDistance();
    updateElevation(center.lat, center.lng, el.mapCenterElevation, elev => {
      mapCenterLocation.elevation = elev;
      updateCalculations();
    });
  }

  // ============================================================
  // 現在地の座標更新（測位コールバック）
  // ============================================================
  function updateCurrentLocation(position) {
    const { latitude: lat, longitude: lng, accuracy } = position.coords;
    const latlng = L.latLng(lat, lng);

    currentLocation = { lat, lng, elevation: undefined };
    el.currentLat.textContent = lat.toFixed(5);
    el.currentLng.textContent = lng.toFixed(5);

    if (!locationMarker) {
      // 初回取得：マーカーと精度円を生成して地図を移動
      locationMarker = L.circleMarker(latlng, {
        radius: 8, fillColor: '#0070ff', color: '#ffffff',
        weight: 2, opacity: 1, fillOpacity: 0.8,
      }).addTo(map);

      accuracyCircle = L.circle(latlng, {
        radius: accuracy, color: '#136aec', fillColor: '#136aec',
        fillOpacity: 0.15, weight: 1, opacity: 0.2,
      }).addTo(map);

      map.setView(latlng, 16);
      el.locationBtn.classList.remove('locating');
    } else {
      locationMarker.setLatLng(latlng);
      accuracyCircle.setLatLng(latlng).setRadius(accuracy);
    }

    updateDistance();
    updateElevation(lat, lng, el.currentElevation, elev => {
      currentLocation.elevation = elev;
      updateCalculations();
    });
  }

  // ============================================================
  // 測位開始
  // ============================================================
  function startWatchPosition() {
    if (!('geolocation' in navigator)) {
      alert('このブラウザは位置情報サービスに対応していません。');
      return;
    }

    el.locationBtn.classList.add('locating');

    navigator.geolocation.watchPosition(
      updateCurrentLocation,
      err => {
        console.error('測位エラー:', err);
        el.locationBtn.classList.remove('locating');
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  }

  // ============================================================
  // イベント登録
  // ============================================================
  map.on('moveend', updateMapCenter);

  el.locationBtn.addEventListener('click', () => {
    if (locationMarker) {
      const latlng = locationMarker.getLatLng();
      map.setView(latlng, Math.max(map.getZoom(), 16));
    } else {
      alert('現在地情報がまだ取得されていません。');
    }
  });

  startWatchPosition();

  // ============================================================
  // POIManagerへの公開インターフェース
  // ============================================================
  return {
    getCurrentLocation:       () => currentLocation,
    getMapCenterLocation:     () => mapCenterLocation,
    getCurrentLocationMarker: () => locationMarker,
  };
}
