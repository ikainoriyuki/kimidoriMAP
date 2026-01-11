import L from 'leaflet';
import 'leaflet.offline';
import * as turf from '@turf/turf';
import { CS_MAPS_CONFIG, FOREST_TYPE_MAPS_CONFIG } from './map_config.js';
import 'leaflet.vectorgrid';

const MAP_STATE_KEY = 'mapState';

// ==========================================
// 1. ストレージ・ユーティリティ(leaflet.offline用)
// ==========================================
const StorageManager = {
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  async updateStorageInfo() {
    const usageDiv = document.getElementById('storageUsage');
    const quotaDiv = document.getElementById('storageQuota');
    if (!usageDiv || !quotaDiv) return;

    try {
      if (navigator.storage && navigator.storage.estimate) {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        const percentage = quota > 0 ? ((usage / quota) * 100).toFixed(1) : 'N/A';
        usageDiv.innerHTML = `使用量: ${this.formatBytes(usage)} <span style="font-size: small;">(${percentage}%)</span>`;
        quotaDiv.innerHTML = `容量: ${this.formatBytes(quota)}`;
      }
    } catch (err) {
      console.error("Storage info error:", err);
    }
  },

  // indexedDBの永続化をリクエスト
  async requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) await navigator.storage.persist();
    }
  }
};

// ==========================================
// 2. マップ位置保存（前回終了した地点から開始）
// ==========================================
const MapStateManager = {
  save(map) {
    const center = map.getCenter();
    const state = { lat: center.lat, lng: center.lng, zoom: map.getZoom() };
    localStorage.setItem(MAP_STATE_KEY, JSON.stringify(state));
  },
  load() {
    const saved = localStorage.getItem(MAP_STATE_KEY);
    try { return saved ? JSON.parse(saved) : null; } catch { return null; }
  }
};

// ==========================================
// 3. leaflet.offlineの進捗UI
// ==========================================
class OfflineProgressUI {
  constructor(map) {
    this.container = L.DomUtil.create('div', 'leaflet-control-savetiles-progress');
    this.setupStyles();
    map.getContainer().appendChild(this.container);
  }

  setupStyles() {
    Object.assign(this.container.style, {
      position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)',
      padding: '8px 15px', backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'white',
      borderRadius: '6px', zIndex: '10000', display: 'none', pointerEvents: 'none'
    });
  }

  show(message, isError = false) {
    this.container.style.display = 'block';
    this.container.style.backgroundColor = isError ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.7)';
    this.container.innerHTML = message;
    if (!message.includes('ダウンロード中:')) {
      setTimeout(() => this.container.style.display = 'none', isError ? 8000 : 3000);
    }
  }

  bindEvents(layer, name) {
    let total = 0, current = 0;
    layer.on('savestart', e => {
      total = e._tilesforSave?.length || 0;
      current = 0;
      this.show(`[${name}] ${total}枚ダウンロード開始...`);
    });
    layer.on('savetileend', () => {
      current++;
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      this.show(`[${name}] ダウンロード中: ${percent}% (${current}/${total})`);
    });
    layer.on('saveend', () => {
      this.show(`[${name}] 完了 (${total}枚)`);
      StorageManager.updateStorageInfo();
    });
    layer.on('saveerror', e => {
      this.show(`❌ [${name}] エラー: ${e.message || '通信失敗'}`, true);
    });
    layer.on('tilesremoved', () => {
      this.show(`🗑️ タイルを削除しました。`);
      StorageManager.updateStorageInfo();
    });
  }
}

// ==========================================
// 4. 地理院Vectorタイル（道路・注記）
// ==========================================
function createGsiVectorOverlay() {
  const overlay = L.gridLayer({ attribution: "<a href='https://github.com/gsi-cyberjapan/vector-tile-experiment'>国土地理院ベクトルタイル提供実験</a>を加工して作成", maxZoom: 18 });

  overlay.createTile = function(coords, done) {
    const tile = document.createElement('div');
    const { z, x, y } = coords;
    const urls = {
      rdcl: `https://cyberjapandata.gsi.go.jp/xyz/experimental_rdcl/${z}/${x}/${y}.geojson`,
      anno: `https://cyberjapandata.gsi.go.jp/xyz/experimental_anno/${z}/${x}/${y}.geojson`,
      nrpt: `https://cyberjapandata.gsi.go.jp/xyz/experimental_nrpt/${z}/${x}/${y}.geojson`
    };

    Promise.all(Object.entries(urls).map(([key, url]) => 
      fetch(url).then(res => res.ok ? res.json() : null).then(data => ({ key, data }))
    )).then(results => {
      results.forEach(({ key, data }) => {
        if (!data) return;
        L.geoJSON(data, {
          style: (f) => key === 'rdcl' ? getRoadStyle(f) : { opacity: 0 },
          pointToLayer: (f, ll) => createLabelMarker(f, ll, key)
        }).addTo(this._map);
      });
      done(null, tile);
    }).catch(() => done(null, tile));

    return tile;
  };

  return overlay;
}

// 道路スタイルの判定ロジック
function getRoadStyle(feature) {
  const { rdCtg, type, rnkWidth } = feature.properties;
  let style = { color: '#884400', weight: 1.5, opacity: 0.8 };
  if (rdCtg === "高速自動車国道等") { style.color = '#007e39ff'; style.weight = 6; }
  else if (rdCtg === "国道") { style.color = '#ff3333ff'; style.weight = 5; }
  if (type === "徒歩道") style.dashArray = '2, 4';
  return style;
}

// ラベル作成ロジック
function createLabelMarker(feature, latlng, key) {
  let text = key === 'anno' ? feature.properties.text : (key === 'nrpt' ? feature.properties.name : "");
  if (!text) return null;
  return L.marker(latlng, {
    icon: L.divIcon({
      className: 'gsi-label-icon',
      html: `<div style="text-shadow: 2px 2px 0 #fff; font-weight:bold;">${text}</div>`,
      iconSize: [0, 0]
    }),
    interactive: false
  });
}

// ==========================================
// 6. ベースレイヤーと動的なレイヤー選択
// ==========================================
const LayerFactory = {
  // ベースレイヤー（背景地図）の生成
  createBaseLayers() {
    return {
      'OpenStreetMap': L.tileLayer.offline(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        { 
          maxZoom: 23, 
          attribution: '&copy; OpenStreetMap', 
          saveToCache: true, 
          useCache: true 
        }
      ),
      '地理院地図': L.tileLayer.offline(
        'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
        { minZoom: 5, maxNativeZoom: 18, maxZoom: 23, attribution: '地理院タイル' }
      ),
      '空中写真（最新）': L.tileLayer.offline(
        'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
        { minZoom: 5, maxNativeZoom: 17, maxZoom: 23, attribution: '地理院タイル' }
      ),
      '空中写真（1974～1979）': L.tileLayer.offline(
        'https://cyberjapandata.gsi.go.jp/xyz/gazo1/{z}/{x}/{y}.jpg',
        { minZoom: 5, maxNativeZoom: 17, maxZoom: 23, attribution: '地理院タイル' }
      )
    };
  },

  // CS・林相などの動的レイヤーの生成
  createDynamicLayers(configs, ui) {
    const dynamicLayers = {};
    configs.forEach(config => {
      const layer = L.tileLayer.offline(config.url, {
        ...config,
        saveToCache: true,
        useCache: true,
        crossOrigin: 'anonymous'
      });
      
      // オフラインイベントのバインド
      ui.bindEvents(layer, config.name);

      dynamicLayers[config.id] = {
        layer: layer,
        name: config.name,
        bounds: L.latLngBounds(config.bounds),
        isAdded: false
      };
    });
    return dynamicLayers;
  }
};

// ==========================================
// 地図選択レイヤの表示内容
// ==========================================

function setupPrefBoundaryControl(map, dynamicLayers, layerControl) {
  let prefData = null;

  const updateVisibility = () => {
    if (!prefData) return;

    const bounds = map.getBounds();
    const screenPoly = turf.bboxPolygon([
      bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()
    ]);
    
    const activePrefs = prefData.features
      .filter(f => {
        try { return turf.booleanIntersects(screenPoly, f); } catch { return false; }
      })
      .map(f => f.properties.N03_001);

    Object.keys(dynamicLayers).forEach(id => {
      const item = dynamicLayers[id];
      const isVisible = activePrefs.some(prefName => item.name.includes(prefName));

      if (isVisible && !item.isAdded) {
        layerControl.addBaseLayer(item.layer, item.name);
        item.isAdded = true;
      } else if (!isVisible && item.isAdded) {
        layerControl.removeLayer(item.layer);
        if (map.hasLayer(item.layer)) map.removeLayer(item.layer);
        item.isAdded = false;
      }
    });
  };

  // 読み込み
  fetch('./pref_boundary_simple.geojson')
    .then(res => res.json())
    .then(data => {
      prefData = data;
      updateVisibility();
    })
    .catch(err => console.warn("境界データの読み込みをスキップしました:", err));

  map.on('moveend', updateVisibility);
}

// ==========================================
// 7. メイン初期化関数
// ==========================================

export async function initMap() {
  // 1. 状態の復元と地図の初期化
  const saved = MapStateManager.load();
  const map = L.map('map', {
    center: saved ? [saved.lat, saved.lng] : [35.6809591, 139.7673068],
    zoom: saved ? saved.zoom : 16,
    maxZoom: 23,
  });

  // 2. UIコンポーネントの準備
  const ui = new OfflineProgressUI(map);

  // 3. レイヤーの生成 (Factoryを使用)
  const baseLayers = LayerFactory.createBaseLayers();
  
  // 各ベースレイヤーにオフラインイベントをバインド
  Object.entries(baseLayers).forEach(([name, layer]) => ui.bindEvents(layer, name));

  // デフォルトレイヤーを表示
  const currentActiveLayer = baseLayers['地理院地図'];
  map.addLayer(currentActiveLayer);

  // 4. レイヤーコントロールのセットアップ
  const layerControl = L.control.layers(baseLayers, []).addTo(map);

  // 5. 動的レイヤー (CS/林相) のセットアップ
  const allConfigs = [...CS_MAPS_CONFIG, ...FOREST_TYPE_MAPS_CONFIG];
  const dynamicLayers = LayerFactory.createDynamicLayers(allConfigs, ui);

  // 6. 都道府県境界データに基づいた表示制御ロジック
  setupPrefBoundaryControl(map, dynamicLayers, layerControl);


  // 7. leaflet.offlineの保存コントロール設定
  const saveControl = L.control.savetiles(currentActiveLayer, {
    position: 'topright',
    zoomlevels: [16, 17, 18],
    confirm: (layer, cb) => {
      const count = layer._tilesforSave?.length || 0;
      if (count > 2500) {
        alert(`枚数が多すぎます(${count}枚)。範囲を狭めてください。`);
        return;
      }
      if (confirm(`保存しますか？ (${count}枚)`)) cb();
    },
    confirmRemoval: (layer, cb) => { if (confirm("削除しますか？")) cb(); },
    saveText: '💾',   // 保存アイコン
    rmText: '🗑️',    // 削除アイコン

  }).addTo(map);

  map.on('baselayerchange', e => saveControl.setLayer(e.layer));
  map.on('moveend zoomend', () => MapStateManager.save(map));

  // 8. オーバーレイとその他のUI
  layerControl.addOverlay(createGsiVectorOverlay(), "道路（オンライン）");
  L.control.scale({ imperial: false }).addTo(map);
  
  // 9. ストレージ管理と永続化
  StorageManager.updateStorageInfo();
  StorageManager.requestPersistence(); 
  
  window.map = map;
  return map;
}