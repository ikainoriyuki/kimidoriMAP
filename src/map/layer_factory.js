import L from 'leaflet';
import 'leaflet.offline';

// ============================================================
// レイヤーファクトリ
// ============================================================
export const LayerFactory = {
  createBaseLayers() {
    const opt = (extra = {}) => ({
      maxZoom: 23, saveToCache: true, useCache: true, ...extra,
    });
    return {
      'OpenStreetMap':          L.tileLayer.offline('https://tile.openstreetmap.org/{z}/{x}/{y}.png',                               { ...opt(), attribution: '&copy; OpenStreetMap' }),
      '地理院地図':              L.tileLayer.offline('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',                    { ...opt({ minZoom: 5, maxNativeZoom: 18 }), attribution: '地理院タイル' }),
      '空中写真（最新）':        L.tileLayer.offline('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',          { ...opt({ minZoom: 5, maxNativeZoom: 17 }), attribution: '地理院タイル' }),
      '空中写真（1974〜1979）':  L.tileLayer.offline('https://cyberjapandata.gsi.go.jp/xyz/gazo1/{z}/{x}/{y}.jpg',                 { ...opt({ minZoom: 5, maxNativeZoom: 17 }), attribution: '地理院タイル' }),
    };
  },

  /**
   * configs を L.layerGroup 1つにまとめる。
   * 各 tileLayer は bounds に基づき地図移動時に表示/非表示を切り替える。
   * 戻り値: { group, tileLayers: [{tileLayer, bounds, name}] }
   */
  createGroupLayer(configs, ui, groupName) {
    const group      = L.layerGroup();
    const tileLayers = [];

    configs.forEach(config => {
      const tileLayer = L.tileLayer.offline(config.url, {
        crossOrigin: 'anonymous',
        saveToCache: true,
        useCache:    true,
        ...config,
      });
      ui.bindEvents(tileLayer, config.name);
      tileLayers.push({
        tileLayer,
        bounds:  L.latLngBounds(config.bounds),
        polygon: config.polygon ?? null,
        name:    config.name,
        inGroup: false,
      });
    });

    return { group, tileLayers, name: groupName };
  },
};
