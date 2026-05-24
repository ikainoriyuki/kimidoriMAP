import L from 'leaflet';
import { getStorageInfo, getStoredTilesAsJson } from 'leaflet.offline';
import { StorageManager } from './storage_manager.js';
import { BoxSelect } from 'lucide';
import { lucideStr } from '../utils.js';

// ============================================================
// 保存エリアオーバーレイ
// ============================================================
const AREA_COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#a9a9a9', '#9a6324', '#469990',
];

async function buildAreaLayer(baseLayers, groupLayers) {
  let colorIndex = 0;
  const layerColorMap = [];

  Object.entries(baseLayers).forEach(([name, layer]) => {
    if (layer._url) layerColorMap.push({ name, url: layer._url, tileSize: layer.getTileSize(), color: AREA_COLORS[colorIndex++ % AREA_COLORS.length] });
  });
  groupLayers.forEach(({ tileLayers }) => {
    tileLayers.forEach(({ name, tileLayer }) => {
      if (tileLayer._url) layerColorMap.push({ name, url: tileLayer._url, tileSize: tileLayer.getTileSize(), color: AREA_COLORS[colorIndex++ % AREA_COLORS.length] });
    });
  });

  const allFeatures = [];
  const legendItems = [];

  for (const { name, url, tileSize, color } of layerColorMap) {
    try {
      const tiles = await getStorageInfo(url);
      if (!tiles || tiles.length === 0) continue;
      const geojson = getStoredTilesAsJson(tileSize, tiles);
      if (geojson?.features) {
        geojson.features.forEach(f => {
          f.properties = { ...f.properties, _color: color };
          allFeatures.push(f);
        });
        legendItems.push({ name, color });
      }
    } catch (e) {
      console.warn('保存エリア取得失敗:', url, e);
    }
  }

  if (allFeatures.length === 0) return null;

  const layer = L.geoJSON({ type: 'FeatureCollection', features: allFeatures }, {
    style: f => ({
      color:       f.properties._color,
      weight:      1.5,
      opacity:     0.8,
      fill:        true,
      fillColor:   f.properties._color,
      fillOpacity: 0.15,
    }),
    interactive: false,
  });

  return { layer, legendItems };
}

export async function setupStorageAreaOverlay(map, baseLayers, groupLayers) {
  const btn = document.getElementById('showStorageAreaBtn');
  if (!btn) return;

  let areaLayer     = null;
  let legendControl = null;
  let visible       = false;

  btn.addEventListener('click', async () => {
    if (visible) {
      if (areaLayer)     { map.removeLayer(areaLayer);     areaLayer     = null; }
      if (legendControl) { map.removeControl(legendControl); legendControl = null; }
      visible = false;
      btn.classList.remove('active');
      btn.innerHTML = `${lucideStr(BoxSelect, 18)} 保存エリア表示`;
      return;
    }

    btn.textContent = '取得中...';
    btn.disabled    = true;

    try {
      const result = await buildAreaLayer(baseLayers, groupLayers);
      if (!result) {
        alert('保存済みのタイルが見つかりません。');
        return;
      }

      const { layer, legendItems } = result;
      layer.addTo(map);
      areaLayer = layer;

      const LegendControl = L.Control.extend({
        onAdd() {
          const div = L.DomUtil.create('div');
          Object.assign(div.style, {
            background:   'rgba(255,255,255,0.92)',
            padding:      '8px 10px',
            borderRadius: '6px',
            fontSize:     '12px',
            lineHeight:   '1.8',
            boxShadow:    '0 1px 5px rgba(0,0,0,0.3)',
            pointerEvents:'none',
          });
          div.innerHTML =
            '<strong style="display:block;margin-bottom:4px;">保存エリア</strong>' +
            legendItems.map(({ name, color }) =>
              `<div style="display:flex;align-items:center;gap:6px;">` +
              `<span style="display:inline-block;width:14px;height:14px;background:${color};border:1px solid rgba(0,0,0,0.3);flex-shrink:0;"></span>` +
              `<span>${name}</span></div>`
            ).join('');
          return div;
        },
      });
      legendControl = new LegendControl({ position: 'topright' });
      legendControl.addTo(map);

      visible = true;
      btn.classList.add('active');
      btn.innerHTML = `${lucideStr(BoxSelect, 18)} 保存エリア非表示`;
    } catch (e) {
      console.error('保存エリア表示エラー:', e);
      alert('保存エリアの取得に失敗しました。');
    } finally {
      btn.disabled = false;
    }
  });
}
