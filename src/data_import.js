import L from 'leaflet';
import * as turf from '@turf/turf'; 
import '@mapbox/leaflet-omnivore';

let geojsonLayers = [];
let geojsonData = null;

export function initDataImport(map) {
  document.getElementById('loadGeoJSON').addEventListener(
    'click', () => {document.getElementById('fileInput').click();}
  );
  document.getElementById('fileInput').addEventListener(
    'change', (event) => loadFile(map, event)
  );
  document.getElementById('applyLabel').addEventListener(
    'click', () =>applyLabel(map)
  );
  document.getElementById('clearGeojson').addEventListener(
    'click', () =>clearGeojson(map)
  );
}

// --- 内部関数 ---
// インポートするデータがWGS84かどうか確認（日本の緯度・経度の範囲内にあるかチェック）
function checkCoordinates(coordinates) {
  const lat_min = 20;
  const lat_max = 46;
  const lng_min = 122;
  const lng_max = 154;
  
  const lng = coordinates[0];
  const lat = coordinates[1];
  
  if (lat > lat_max || lat < lat_min || lng > lng_max || lng < lng_min) {
    return false; 
  } else {
    return true; // WGS84の可能性が高い
  }
}

function loadFile(map, event) {
  let file = event.target.files[0];
  if (!file) { return; }

  let reader = new FileReader();
  reader.onload = function(e) {
    let fileName = file.name.toLowerCase();
    let fileContent = e.target.result;
    let geoJSONOptions = {
      onEachFeature: handleFeature,
      // ポイントはピンではなく、円で表示
      pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, {
          radius: 6,
          // fillColor: '#ffffffff',
          // color: '#00eeffff',
          // weight: 1,
          opacity: 1,
        });
      },
      // ポイント、ライン、ポリゴンのスタイル設定
      style: function (feature) {
        return {
          color: '#00eeffff',
          weight: 2,
          fill: false,
        };
      }
    };
    
    let geojsonLayer;
    try {
      if (fileName.endsWith('.geojson') || fileName.endsWith('.json')) {
        geojsonData = JSON.parse(fileContent);
        geojsonLayer = L.geoJSON(geojsonData, geoJSONOptions);
      } else if (fileName.endsWith('.kml')) {
        geojsonLayer = omnivore.kml.parse(fileContent, null, L.geoJSON(null, geoJSONOptions));
      } else if (fileName.endsWith('.gpx')) {
        geojsonLayer = omnivore.gpx.parse(fileContent, null, L.geoJSON(null, geoJSONOptions));
      } else {
        alert('GeoJSON (.geojson, .json), KML (.kml), または GPX (.gpx) ファイルを選択してください。');
        return;
      }

      console.log('Loaded file:', fileName);
   

      if (geojsonLayer) {
        geojsonLayer.addTo(map);
        geojsonLayers.push(geojsonLayer); 
        map.fitBounds(geojsonLayer.getBounds());

        if (!geojsonData || fileName.endsWith('.kml') || fileName.endsWith('.gpx')) { 
          // KML/GPXの場合はtoGeoJSONでプロパティキーを抽出
          if (geojsonLayer.toGeoJSON) {
            geojsonData = geojsonLayer.toGeoJSON();
          } else {
            console.warn('GeoJSON変換に失敗。ラベルオプションの更新をスキップします。');
            return;
          }
        }
        
        const keys = extractPropertyKeys(geojsonData);
        populateLabelAttrOptions(keys);
      }
    } catch (error) {
      alert('ファイルの解析に失敗しました。');
      console.error('File parse error:', error);
    }
  };
  reader.readAsText(file);
}

// --- ポップアップの設定 ---
function handleFeature(feature, layer) {
  let props = feature.properties;
  if (props) {
    let popupContent = Object.entries(props)
      .map(([key, val]) => `<strong>${key}</strong>: ${val}`)
      .join('<br>');
    layer.bindPopup(popupContent);
  }
}

// --- ラベル表示関連---
// ラベル候補となるフィーチャーの一覧を作成
function extractPropertyKeys(geojsonData) {
  const keysSet = new Set();
  geojsonData.features.forEach(feature => {
    if (feature.properties) {
      Object.keys(feature.properties).forEach(key => keysSet.add(key));
    }
  });
  return Array.from(keysSet);
}

// 表示するラベルの選択
function populateLabelAttrOptions(keys) {
  const select = document.getElementById('labelAttr');
  select.innerHTML = ''; 
  keys.forEach(key => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    select.appendChild(option);
  });
}

function getSelectedLabelAttr() {
  return document.getElementById('labelAttr').value;
}

function applyLabel(map) {
  if (geojsonLayers.length === 0) { alert('先にGeoJSONを読み込んでください。'); return; }

  const labelAttr = getSelectedLabelAttr();

  // 既存ラベルの初期化
  geojsonLayers.forEach(geojsonLayer => {
    geojsonLayer.eachLayer(layer => {
      if (layer._customTooltip) {
        map.removeLayer(layer._customTooltip);
        layer._customTooltip = null;
      }
      if (layer.getTooltip()) { layer.unbindTooltip(); }
    });
  });

  // 新しいラベル描画
  geojsonLayers.forEach(geojsonLayer => {
    geojsonLayer.eachLayer(function (layer) {
      const feature = layer.feature;
      const props = feature?.properties;
      const labelText = String(props?.[labelAttr] ?? '').trim();
      if (!labelText) return;

      let latlng;
      const geomType = feature.geometry.type;

      if (geomType === 'Point') {
        latlng = layer.getLatLng();
      } else {
        // turf.jsを使ってポリゴン・ラインの中心点を計算
        const centerPoint = turf.pointOnFeature(feature); 
        const coords = centerPoint.geometry.coordinates;
        latlng = L.latLng(coords[1], coords[0]);
      }

      const tooltip = L.tooltip({
        permanent: true,
        direction: geomType === 'Point' ? 'right' : 'center',
        className: 'my-label-tooltip'
      })
        .setContent(labelText)
        .setLatLng(latlng)
        .addTo(map);

      layer._customTooltip = tooltip;
    });
  });
}

function clearGeojson(map) {
  if (geojsonLayers.length === 0) { alert('表示中のデータはありません。'); return; }

  const confirmDelete = window.confirm('すべての読み込みレイヤーを削除してもよろしいですか？');

  if (confirmDelete) {
    geojsonLayers.forEach(geojsonLayer => {
      geojsonLayer.eachLayer(layer => {
        if (layer._customTooltip) {
          map.removeLayer(layer._customTooltip);
        }
      });
      map.removeLayer(geojsonLayer);
    });
    geojsonLayers = []; 
    alert('すべてのレイヤーを削除しました。');
  }
}