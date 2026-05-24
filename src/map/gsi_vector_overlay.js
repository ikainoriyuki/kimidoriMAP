import L from 'leaflet';
import 'leaflet.vectorgrid';
import Protobuf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';

// ============================================================
// 地理院ベクタータイル 地名レイヤー（カスタム GridLayer）
// leaflet.vectorgrid は DivIcon 非対応のため独自実装
// ============================================================
const TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf';
const ATTRIBUTION = "<a href='https://github.com/gsi-cyberjapan/gsimaps-vector-experiment'>国土地理院ベクトルタイル提供実験</a>を加工して作成";

const GsiPlaceNameGridLayer = L.GridLayer.extend({
  initialize(options) {
    L.GridLayer.prototype.initialize.call(this, options);
    // タイルキー → マーカー配列 のマップ
    this._tileMarkers = {};
  },

  createTile(coords, done) {
    const tile = document.createElement('div');
    const url = TILE_URL
      .replace('{z}', coords.z)
      .replace('{x}', coords.x)
      .replace('{y}', coords.y);

    fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => {
        const vt = new VectorTile(new Protobuf(buf));
        const layer = vt.layers['label'];
        if (!layer) { done(null, tile); return; }

        const key = `${coords.z}:${coords.x}:${coords.y}`;
        const markers = [];

        for (let i = 0; i < layer.length; i++) {
          const feat = layer.feature(i);
          const text = feat.properties.knj || '';
          if (!text) continue;

          const geom = feat.loadGeometry(); // [[ {x,y}, ... ], ...]
          const pt = geom[0][0];
          const extent = layer.extent || 4096;
          const latlng = this._pointToLatLng(coords, pt, extent);

          const marker = L.marker(latlng, {
            icon: L.divIcon({
              html: `<div class="gsi-place-label">${text}</div>`,
              className: '',
              iconSize: [0, 0],
              iconAnchor: [0, 8],
            }),
            interactive: false,
            pane: 'shadowPane', // overlayPane より下に描画
          });
          marker.addTo(this._map);
          markers.push(marker);
        }

        this._tileMarkers[key] = markers;
        done(null, tile);
      })
      .catch(e => done(e, tile));

    return tile;
  },

  _removeTile(key) {
    const tileKey = key.replace(/\//g, ':');
    const markers = this._tileMarkers[tileKey];
    if (markers) {
      markers.forEach(m => m.remove());
      delete this._tileMarkers[tileKey];
    }
    L.GridLayer.prototype._removeTile.call(this, key);
  },

  onRemove(map) {
    Object.values(this._tileMarkers).forEach(markers =>
      markers.forEach(m => m.remove())
    );
    this._tileMarkers = {};
    L.GridLayer.prototype.onRemove.call(this, map);
  },

  // タイル座標（ベクタータイル内ピクセル）→ LatLng 変換
  _pointToLatLng(coords, pt, extent) {
    const size = extent;
    const z2 = Math.pow(2, coords.z);
    const lng = ((coords.x + pt.x / size) / z2) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * (coords.y + pt.y / size)) / z2;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return L.latLng(lat, lng);
  },
});

export function createGsiPlaceNameOverlay() {
  return new GsiPlaceNameGridLayer({
    attribution: ATTRIBUTION,
    maxNativeZoom: 16,
    maxZoom: 23,
    minZoom: 14,
    tileSize: 256,
    pane: 'overlayPane',
  });
}

export function createGsiVectorOverlay() {
  const INVISIBLE = { opacity: 0, fillOpacity: 0, weight: 0 };

  // rdCtg は整数: 0=国道, 1=都道府県道, 2=市区町村道, 3=高速自動車国道等, 5=その他
  // ftCode: 2701-2704=通常道路, 2711-2714=庭園路, 2721-2724=徒歩道, 2731-2734=石段
  const roadStyle = properties => {
    const base = { opacity: 0.85, fill: false };
    const ftCode = properties.ftCode;
    if (ftCode >= 2721 && ftCode <= 2734)
      return { ...base, color: '#884400', weight: 1, dashArray: '4,4' };
    if (ftCode >= 2711 && ftCode <= 2714)
      return { ...base, color: '#884400', weight: 1 };
    const c = properties.rdCtg;
    if (c === 3) return { ...base, color: '#007e39', weight: 5 };
    if (c === 0) return { ...base, color: '#e63333', weight: 4 };
    if (c === 1) return { ...base, color: '#e68800', weight: 2.5 };
    if (c === 2) return { ...base, color: '#888888', weight: 1.5 };
    return { ...base, color: '#aaaaaa', weight: 1 };
  };

  return L.vectorGrid.protobuf(
    'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf',
    {
      attribution: "<a href='https://github.com/gsi-cyberjapan/gsimaps-vector-experiment'>国土地理院ベクトルタイル提供実験</a>を加工して作成",
      maxNativeZoom: 16,
      maxZoom: 23,
      interactive: false,
      vectorTileLayerStyles: new Proxy(
        { road: roadStyle },
        { get: (t, k) => (typeof k === 'symbol' ? t[k] : k in t ? t[k] : INVISIBLE) }
      ),
    }
  );
}
