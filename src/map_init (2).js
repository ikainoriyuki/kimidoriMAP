import L from 'leaflet';
import 'leaflet.offline';
import * as turf from '@turf/turf';
import { CS_MAPS_CONFIG } from './map_config.js';
import { FOREST_TYPE_MAPS_CONFIG } from './map_config.js';
import 'leaflet.vectorgrid';

// --- 起動時に、前回終了した地点の地図を表示する ---
const MAP_STATE_KEY = 'mapState';

function saveMapState(map) {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const state = { lat: center.lat, lng: center.lng, zoom };
  localStorage.setItem(MAP_STATE_KEY, JSON.stringify(state));
}

function loadMapState() {
  const savedState = localStorage.getItem(MAP_STATE_KEY);
  if (savedState) {
    try {
      return JSON.parse(savedState);
    } catch (e) {
      console.error("Failed to parse map state", e);
      localStorage.removeItem(MAP_STATE_KEY);
    }
  }
  return null;
}

// バイト数を読みやすい形式（MB, GB）に変換するヘルパー関数
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// スライドメニュー内のストレージ情報を更新する関数
async function updateStorageInfo() {
  const usageDiv = document.getElementById('storageUsage');
  const quotaDiv = document.getElementById('storageQuota');
    
  // 要素がない場合はスキップ
  if (!usageDiv || !quotaDiv) return;

  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? ((usage / quota) * 100).toFixed(1) : 'N/A';

      usageDiv.innerHTML = `使用量: ${formatBytes(usage)} <span style="font-size: small;">(${percentage}%)</span>`;
      quotaDiv.innerHTML = `容量: ${formatBytes(quota)}`;
          
      // デバッグ用ログ
      console.log(`Storage Updated: ${formatBytes(usage)} / ${formatBytes(quota)}`);
    } else {
      usageDiv.innerHTML = "容量: ブラウザ非対応";
    }
  } catch (err) {
    console.error("Failed to update storage info:", err);
    usageDiv.innerHTML = "容量: 取得エラー";
  }
}

// --- IndexedDBのストレージ永続化の要求 ---
async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) {
    console.warn("このブラウザは Storage Persistence API に対応していません。");
    return;
  }

  // 既に永続化されているか確認
  const isPersisted = await navigator.storage.persisted();

  if (isPersisted) {
    console.log("ストレージは既に永続化されています。");
    return;
  }

  // 永続化を要求
  const result = await navigator.storage.persist();

  if (result) {
    console.log("ストレージの永続化要求が承諾されました。");
    // 必要に応じてユーザーに通知するUIを表示
  } else {
    console.warn("ストレージの永続化要求は拒否されました。");
    // ユーザーに手動で設定変更を促すUIを表示
  }
}

// --- 初期化 ---
export async function initMap() {
  const savedState = loadMapState();
  const initialCenter = savedState ? [savedState.lat, savedState.lng] : [35.6809591, 139.7673068];
  const initialZoom = savedState ? savedState.zoom : 16;

  const map = L.map('map', {
    center: initialCenter,
    zoom: initialZoom,
    maxZoom: 23,
  });

  // --- オフライン対応タイルレイヤー（保存・読み出し有効） ---
  const osmOffline = L.tileLayer.offline(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 23,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      saveToCache: true,
      useCache: true,
    }
  );

  const gsiOffline = L.tileLayer.offline(
    'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    {
      minZoom: 5,
      maxNativeZoom: 18,
      maxZoom: 23,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
    }
  );


  const csLayerInstances = {};

  const baseLayers = {
    OpenStreetMap: osmOffline,
    地理院地図: gsiOffline,
    '空中写真（最新）': L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', {
      minZoom: 5,
      maxNativeZoom: 17,
      maxZoom: 23,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
    }),
    '空中写真（1974～1979）': L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/gazo1/{z}/{x}/{y}.jpg', {
      minZoom: 5,
      maxNativeZoom: 17,
      maxZoom: 23,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',
    }),
  };

  let currentActiveLayer = (baseLayers['地理院地図']);

  // デフォルトレイヤー
  map.addLayer(currentActiveLayer);
  const layerControl = L.control.layers(baseLayers, []).addTo(map);

  // CSおよび林相識別図用オブジェクト
  const dynamicLayers = {};

  function setupDynamicLayers(configs, categoryId) {
    configs.forEach(config => {
      const layer = L.tileLayer.offline(config.url, {
        minZoom: config.minZoom,
        maxNativeZoom: config.maxNativeZoom,
        maxZoom: config.maxZoom,
        bounds: L.latLngBounds(config.bounds), 
        attribution: config.attribution,
        saveToCache: true,
        useCache: true,
      });

      // オフラインイベントのバインド
      bindOfflineEvents(layer, config.name);

      // 管理用データに格納
      dynamicLayers[config.id] = {
        layer: layer,
        name: config.name,
        bounds: L.latLngBounds(config.bounds),
        isAdded: false
      };
    });
  }

// CSマップと林相識別図の両方をセットアップ
setupDynamicLayers(CS_MAPS_CONFIG, 'cs');
setupDynamicLayers(FOREST_TYPE_MAPS_CONFIG, 'forest');

// --- レイヤーの表示・非表示を制御する関数 ---
const response = await fetch('./pref_boundary_simple.geojson');
const prefData = await response.json();

function updateLayerVisibility() {
    // 1. 現在の画面表示範囲（Bounds）を取得してTurfのポリゴンに変換
    const bounds = map.getBounds();
    const bbox = [
      bounds.getWest(), // minX
      bounds.getSouth(), // minY
      bounds.getEast(), // maxX
      bounds.getNorth() // maxY
    ];
    const screenPolygon = turf.bboxPolygon(bbox);

    // 2. 画面内に入っている（交差している）すべての県名を抽出
    const intersectingPrefs = prefData.features
      .filter(f => {
        try {
          // 画面の四角と県のポリゴンが重なっているか判定
          return turf.booleanIntersects(screenPolygon, f);
        } catch (e) {
          return false;
        }
      })
      .map(f => f.properties.N03_001); // 県名の配列を作る

    // 3. 各レイヤーの表示・非表示を切り替え
    Object.keys(dynamicLayers).forEach(id => {
      const item = dynamicLayers[id];
      
      // レイヤーの名前に、交差しているいずれかの県名が含まれているか判定
      const isVisible = intersectingPrefs.some(prefName => item.name.includes(prefName));

      if (isVisible && !item.isAdded) {
        // 画面内に入ったのでリストに追加
        layerControl.addBaseLayer(item.layer, item.name);
        item.isAdded = true;
      } 
      else if (!isVisible && item.isAdded) {
        // 画面から完全に消えたのでリストから削除
        layerControl.removeLayer(item.layer);
        // 地図上に表示中の場合はそれも消す
        if (map.hasLayer(item.layer)) {
          map.removeLayer(item.layer);
        }
        item.isAdded = false;
      }
    });
  }

  // 地図が動くたびにチェック
  map.on('moveend', updateLayerVisibility);
  
  // 初回実行
  updateLayerVisibility();

// --- 地理院GeoJSONタイル（道路中心線・注記・名称）の設定 ---
const gsiGeoJsonOverlay = L.gridLayer({
    attribution: "地理院地図 Vector (道路中心線・注記)",
    maxZoom: 18
});

gsiGeoJsonOverlay.createTile = function(coords, done) {
    const tile = document.createElement('div');
    const z = coords.z;
    const x = coords.x;
    const y = coords.y;

    // 取得したい3つのエンドポイント
    const urls = {
        rdcl: `https://cyberjapandata.gsi.go.jp/xyz/experimental_rdcl/${z}/${x}/${y}.geojson`,
        anno: `https://cyberjapandata.gsi.go.jp/xyz/experimental_anno/${z}/${x}/${y}.geojson`,
        nrpt: `https://cyberjapandata.gsi.go.jp/xyz/experimental_nrpt/${z}/${x}/${y}.geojson`
    };
function getRoadStyle(feature) {
    const props = feature.properties;
    const ctg = props.rdCtg;       // 道路種別（文字列） 
    const type = props.type;       // 「通常部」「石段」「庭園路」など 
    const width = props.rnkWidth;  // 幅員区分 

    // 1. 道路種別による色分け
    let style = {
        color: '#666666', // デフォルト（市区町村道など）
        weight: 1.5,
        opacity: 0.8
    };

    if (ctg === "高速自動車国道等") {
        style.color = '#ff7800';
        style.weight = 4;
    } else if (ctg === "国道") {
        style.color = '#ff3333';
        style.weight = 3;
    } else if (ctg === "都道府県道") {
        style.color = '#0066ff';
        style.weight = 2.5;
    }

    // 2. 特殊な道（石段など）の見た目を変える
    if (type === "石段") {
        style.dashArray = '2, 4'; // 点線にする
        style.color = '#884400';
    } else if (type === "庭園路") {
        style.color = '#00aa00';
        style.weight = 1.0;
    }

    // 3. 幅員が広い道（13m以上など）を少し太くする
    if (width && width.includes("13m以上")) {
        style.weight += 1.5;
    }

    return style;
}

// L.geoJSON 内での呼び出し
// style: (feature) => getRoadStyle(feature),

    // すべてのデータを取得
    Promise.all(Object.entries(urls).map(([key, url]) => 
        fetch(url).then(res => res.ok ? res.json() : null).then(data => ({ key, data }))
    )).then(results => {
        results.forEach(({ key, data }) => {
            if (!data) return;

            L.geoJSON(data, {
style: (feature) => {
        if (key === 'rdcl') {
            return getRoadStyle(feature); // ここで種別判定
        }
        return { opacity: 0, weight: 0 };
    },
                pointToLayer: (feature, latlng) => {
                    let labelText = "";
                    if (key === 'anno') labelText = feature.properties.text; // 注記
                    if (key === 'nrpt') labelText = feature.properties.name; // 自然地名称

                    if (labelText) {
                        return L.marker(latlng, {
                            icon: L.divIcon({
                                className: 'gsi-label-icon',
                                html: `<div style="
                                    white-space:nowrap; 
                                    font-weight:bold; 
                                    color:#000; 
                                    text-shadow: 2px 2px 0 #fff, -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff;
                                    font-size:12px;">${labelText}</div>`,
                                iconSize: [0, 0]
                            }),
                            interactive: false
                        });
                    }
                    return null;
                }
            }).addTo(this._map);
        });
        done(null, tile);
    }).catch(err => {
        console.error("Tile load error:", err);
        done(null, tile);
    });

    return tile;
};

// レイヤーコントロールに追加
layerControl.addOverlay(gsiGeoJsonOverlay, "道路中心線・地名注記");

  // --- スケールバー ---
  L.control.scale({ maxWidth: 200, position: 'bottomright', imperial: false }).addTo(map);

  // --- ズーム表示 ---
  const zoomDisplay = L.control({ position: 'bottomright' });
  zoomDisplay.onAdd = function () {
    this._div = L.DomUtil.create('div', 'info');
    this.update(map.getZoom());
    return this._div;
  };
  zoomDisplay.update = function (zoom) {
    this._div.innerHTML = `<div>Zoom: ${zoom}</div>`;
  };
  zoomDisplay.addTo(map);
  map.on('zoomend', () => zoomDisplay.update(map.getZoom()));

  // --- 状態保存 ---
  map.on('moveend zoomend', () => saveMapState(map));

  // --- タイル保存/削除コントロールの追加 ---
  // 例: 現在ズームを含む [16, 17, 18] を保存対象にする
  const saveTilesControl = L.control.savetiles(currentActiveLayer, {
    position: 'topright',
    zoomlevels: [15, 16, 17, 18], 
    delay: 200,

    // 保存・削除の両方に共通する確認処理
    // 保存時の確認
    confirm: function (layer, successCallback) {
      const tileCount = layer._tilesforSave ? layer._tilesforSave.length : 0;
      if (tileCount > 2500) {
        alert(`保存する地図の枚数が2,500枚以下になるように、ズームするなど地図の表示範囲を狭めてください（${tileCount}枚）。\n（サーバーへの負荷軽減のため）`);
        return; 
      }
      
      if (window.confirm(`オフライン用に表示範囲の地図を保存しますか（${tileCount} 枚の地図タイル）？`)) {
        successCallback();
      }
    },

    // 削除時の確認（提示いただいたコードの書き方）
    confirmRemoval: function (layer, successCallback) {
      if (window.confirm("保存された地図を削除しますか？")) {
        successCallback();
      }
    },



  });
  saveTilesControl.addTo(map);

  map.on('baselayerchange', function (e) {
    currentActiveLayer = e.layer;
    if (saveTilesControl && typeof saveTilesControl.setLayer === 'function') {
      saveTilesControl.setLayer(currentActiveLayer);
      console.log("保存対象を切り替えました:", e.name);
    }
  });

  // --- ダウンロード進捗・エラー表示ウィンドウの作成 ---
  const progressDiv = L.DomUtil.create('div', 'leaflet-control-savetiles-progress');
  progressDiv.style.position = 'absolute';
  progressDiv.style.bottom = '10px';
  progressDiv.style.left = '50%';
  progressDiv.style.transform = 'translateX(-50%)';
  progressDiv.style.padding = '8px 15px';
  progressDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; 
  progressDiv.style.color = 'white';
  progressDiv.style.borderRadius = '6px';
  progressDiv.style.zIndex = '10000'; // 最前面に表示
  progressDiv.style.display = 'none';
  progressDiv.style.pointerEvents = 'none'; // マップ操作を妨げないように
  map.getContainer().appendChild(progressDiv);

  // メッセージ表示ヘルパー関数
  function showMessage(message, isError = false) {
      progressDiv.style.display = 'block';
      progressDiv.style.backgroundColor = isError ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.7)';
      progressDiv.innerHTML = message;
      
      // 進捗メッセージでない場合（開始、完了、エラー）は、一定時間後に非表示にする
      if (!message.includes('ダウンロード中:')) {
        const timeout = isError ? 8000 : 3000; 
        setTimeout(() => {
            progressDiv.style.display = 'none';
        }, timeout);
      }
  }

  // --- タイル保存イベントバインド関数 ---
  function bindOfflineEvents(layer, name) {
    let totalTiles = 0;
    let currentCount = 0;

    layer.on('savestart', e => {
      totalTiles = (e._tilesforSave && e._tilesforSave.length) ? e._tilesforSave.length : 0;
      currentCount = 0;

      console.log(`[${name}] Saving tiles started${totalTiles}枚`, e);
      showMessage(` [${name}] ${totalTiles}枚ダウンロード開始...`);
    });

    layer.on('savetileend', () => {
      currentCount += 1;
      const percent = totalTiles > 0 ? Math.round((currentCount / totalTiles) * 100) : 0;
      // シンプルに進捗を更新
      showMessage(` [${name}] ダウンロード中: ${percent}% (${currentCount} / ${totalTiles} 枚)`);
    });

    layer.on('saveend', e => {
      console.log(`[${name}] Saving tiles finished`, e);
      showMessage(` [${name}] ダウンロード完了 (${totalTiles} 枚)`);
      updateStorageInfo(); // 完了時にストレージ情報を更新
    });

      layer.on('saveerror', e => {
          console.error(`[${name}] Saving tiles failed`, e);
          
          let errorMessage = `[${name}] タイル保存中にエラーが発生しました。`;
          if (e.message && e.message.includes('Failed to fetch')) {
              errorMessage += 'サーバー通信失敗 (CORS/ネットワークの問題の可能性)。';
          } else if (e.message) {
              errorMessage += `詳細: ${e.message}`;
          } else {
              errorMessage += 'ブラウザのコンソールを確認してください。';
          }
          
          showMessage(`❌ ${errorMessage}`, true); // エラーフラグを立てて赤色表示
          updateStorageInfo(); // エラー発生時にもストレージ情報を更新
      });

    layer.on('tilesremoved', e => {
      console.log(`[${name}] Tiles removed`, e);
      showMessage(`🗑️ タイルを削除しました。`);
      updateStorageInfo(); // 削除時にストレージ情報を更新
    });
  }

  // --- イベントのバインド実行 ---
  // CS立体図と林相識別図以外（これらはすでにバインド済み）
  bindOfflineEvents(osmOffline, 'OpenStreetMap');
  bindOfflineEvents(gsiOffline, '地理院地図');
  
  // 既存のcsmapのログ出力を置き換え、進捗ウィンドウに表示させる

  // 初回実行: DOMが確実に描画されるよう少し待機
  setTimeout(() => {
    updateStorageInfo();
  }, 100);

  // --- ストレージ情報の初期表示と定期更新 ---
  updateStorageInfo();

  // --- 永続化の要求 (script.jsから移動) ---
  requestPersistence();

  // mapをグローバルスコープに公開
  window.map = map;
  return map;
}