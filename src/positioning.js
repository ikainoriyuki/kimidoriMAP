import { updateElevation } from './utils.js';

let currentLocation = null;
let mapCenterLocation = null;

export function initPositioning(map) {
  // ------------------------------
  // 現在地の表示
  // ------------------------------

  // --- DOMと変数 ---
  // 現在地
  const currentLatElement = document.getElementById('currentLat');
  const currentLngElement = document.getElementById('currentLng');
  const currentElevationElement = document.getElementById('currentElevation');

  // 画面の中心
  const mapCenterLatElement = document.getElementById('mapCenterLat');
  const mapCenterLngElement = document.getElementById('mapCenterLng');
  const mapCenterElevationElement = document.getElementById('mapCenterElevation');

  // 距離計測と標高差と傾斜角
  const distanceElement = document.getElementById('distance');
  const elevationDifferenceElement = document.getElementById('elevationDifference');
  const slopeElement = document.getElementById('slope');

  // 現在地に移動
  const currentLocationBtn = document.getElementById('currentLocationControl');

  let currentLocationMarker = null; // 現在地マーカー
  let currentAccuracyCircle = null; // 精度円

  // --- イベントリスナーと関数 ---
  // 現在地測位の開始
  startGeolocationWatch();
  
  // 地図移動時の中心座標更新
  map.on('moveend', updateMapCenter);
  
  // 現在地へ移動ボタンのクリックイベント
  currentLocationBtn.addEventListener('click', function() {
    if (currentLocationMarker) {
      const latlng = currentLocationMarker.getLatLng();
      map.setView(latlng, map.getZoom() < 16 ? 16 : map.getZoom());
    } else {
      alert("現在地情報がまだ取得されていません。");
    }
  });

  // --- 内部関数 ---
  // 距離と標高差の計算（現在地－画面の中心）
  function updateCalculations() {
    if (currentLocation && currentLocation.elevation !== null && mapCenterLocation && mapCenterLocation.elevation !== null) {
      const distanceMeters = L.latLng(currentLocation.lat, currentLocation.lng).distanceTo(L.latLng(mapCenterLocation.lat, mapCenterLocation.lng));
      const elevationDifference = mapCenterLocation.elevation - currentLocation.elevation;
      let degrees = 0;

      if (distanceMeters > 0) {
        // Math.atanでラジアンを求め、(180 / Math.PI) を掛けて度（°）に変換
        const radians = Math.atan(elevationDifference / distanceMeters);
        degrees = radians * (180 / Math.PI);
      }

      distanceElement.textContent = `${(distanceMeters).toFixed(0)} m`;
      elevationDifferenceElement.textContent = `${elevationDifference.toFixed(0)} m`;
      slopeElement.textContent = `${degrees.toFixed(0)} °`;
    }
  }

  // 画面の中心の座標
  function updateMapCenter() {
    const center = map.getCenter();
    mapCenterLocation = { lat: center.lat, lng: center.lng, elevation: null };
    mapCenterLatElement.textContent = center.lat.toFixed(5);
    mapCenterLngElement.textContent = center.lng.toFixed(5);
    updateElevation(center.lat, center.lng, mapCenterElevationElement, (elevation) => {
        mapCenterLocation.elevation = elevation;
        updateCalculations();
    });
  }

  // 現在地の座標
  function updateCurrentLocation(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    const latlng = L.latLng(lat, lng);
    currentLocation = { lat, lng, elevation: null };
    currentLatElement.textContent = lat.toFixed(5);
    currentLngElement.textContent = lng.toFixed(5);
    
    if (!currentLocationMarker) {
      currentLocationMarker = L.circleMarker(latlng, {
        radius: 8, fillColor: '#0070FF', color: '#FFFFFF', weight: 2, opacity: 1, fillOpacity: 0.8
      }).addTo(map);
        
      map.setView(latlng, 16); 
      
      currentAccuracyCircle = L.circle(latlng, {
          radius: accuracy, color: '#136AEC', fillColor: '#136AEC', fillOpacity: 0.15, weight: 1, opacity: 0.2
      }).addTo(map);

      // 現在地移動ボタンの点滅をストップ
      currentLocationBtn.classList.remove('locating');

    } else {
      currentLocationMarker.setLatLng(latlng);
      currentAccuracyCircle.setLatLng(latlng).setRadius(accuracy);
    }
    
    updateElevation(lat, lng, currentElevationElement, (elevation) => {
      currentLocation.elevation = elevation;
      updateCalculations();
    });
  }

  // 現在地測位の開始
  function startGeolocationWatch() {
    if ('geolocation' in navigator) {
      currentLocationBtn.classList.add('locating');

      const options = {
        enableHighAccuracy: true, timeout: 30000, maximumAge: 0
      };  
          
      navigator.geolocation.watchPosition(
        (position) => {
          updateCurrentLocation(position);
        },
        (error) => {
          console.error('Geolocation Error:', error);
          // エラー時のUI更新ロジック
          currentLocationBtn.classList.remove('locating');
        },
          options
      );
    } else {
      alert("このブラウザは位置情報サービスに対応していません。");
    }
  }

  // POI Managerから使用できるように現在地情報を返す関数
  return {
    getCurrentLocation: () => currentLocation,
    getMapCenterLocation: () => mapCenterLocation,
    getCurrentLocationMarker: () => currentLocationMarker,
  };
}