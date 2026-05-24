// ============================================================
// data_export.js — POIデータのエクスポート（GPX / KML / KMZ / GeoJSON）
// ============================================================

import JSZip from 'jszip';
import { getPhotoFromDB } from './indexedDB_poi_storage.js';


// ============================================================
// 共通ユーティリティ
// ============================================================

/** POIの写真ファイル名を返す（photoIdがない場合はnull） */
function photoFilename(poi) {
  if (!poi.photoId) return null;
  const d   = poi.timestamp instanceof Date ? poi.timestamp : new Date(poi.timestamp);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
}

/** タイムスタンプ付きファイル名を生成する */
export function createFileName() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}_${time}_locations`;
}

/** Blobを生成してダウンロードする */
function downloadFile(content, fileName, contentType) {
  const blob = new Blob([content], { type: contentType });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: fileName,
  });
  a.click();
}

/** POIが空の場合はアラートを出して処理を止める */
export function guardEmpty(poiArray) {
  if (poiArray.length === 0) {
    alert('保存された地点がありません。');
    return true;
  }
  return false;
}

/** #RRGGBB → KML の AABBGGRR 形式に変換する */
function hexToKmlColor(hex, alpha = 'ff') {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `${alpha}${b}${g}${r}`;
}

/** ライン・ポリゴン用の KML Style ブロックを返す */
function kmlStyleBlock(color) {
  const lineColor = hexToKmlColor(color, 'ff');
  const fillColor = hexToKmlColor(color, '33'); // 不透明度 0.2
  return `
  <Style id="lineStyle">
    <LineStyle><color>${lineColor}</color><width>2</width></LineStyle>
  </Style>
  <Style id="polygonStyle">
    <LineStyle><color>${lineColor}</color><width>2</width></LineStyle>
    <PolyStyle><color>${fillColor}</color></PolyStyle>
  </Style>`;
}

/** localStorage から現在の描画色を取得する */
function getCurrentColor() {
  return localStorage.getItem('poiColor') || '#004926';
}

// ============================================================
// GPXエクスポート
// ============================================================
export function generateGPXString(poiArray, lineArray = []) {
  const poiById = Object.fromEntries(poiArray.map(p => [p.id, p]));
  const linePoiIds = new Set(lineArray.flatMap(l => l.poiIds));

  const header = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
    `<gpx version="1.1" creator="Noriyuki IKAI" xmlns="http://www.topografix.com/GPX/1/1">\n`;

  const wpts = poiArray
    .filter(poi => !linePoiIds.has(poi.id))
    .map(poi => {
      const fname = photoFilename(poi);
      return `<wpt lat="${poi.latlng.lat}" lon="${poi.latlng.lng}">
  <time>${poi.timestamp.toISOString()}</time>
  <name>${poi.stake_type}${poi.number}</name>
  <desc>${poi.description}</desc>
  <src>${poi.positioning}</src>${fname ? `\n  <cmt>photo:${fname}</cmt>` : ''}
</wpt>`;
    }).join('\n');

  const trks = lineArray.map(line => {
    const pts = line.poiIds.map(id => poiById[id]).filter(Boolean);
    if (pts.length < 2) return '';
    const name = line.name || (pts[0] ? `${pts[0].stake_type}${pts[0].number}→${pts[pts.length-1].stake_type}${pts[pts.length-1].number}` : 'Line');
    const trkpts = pts.map(poi => `    <trkpt lat="${poi.latlng.lat}" lon="${poi.latlng.lng}">
      <time>${poi.timestamp.toISOString()}</time>
      <name>${poi.stake_type}${poi.number}</name>
      <desc>${poi.description}</desc>
    </trkpt>`).join('\n');
    return `<trk><name>${name}</name><trkseg>\n${trkpts}\n</trkseg></trk>`;
  }).filter(Boolean).join('\n');

  return header + wpts + '\n' + trks + '\n' + `</gpx>`;
}

export function exportToGPX(poiArray, lineArray = [], filename = createFileName()) {
  if (guardEmpty(poiArray)) return;
  downloadFile(generateGPXString(poiArray, lineArray), filename + '.gpx', 'application/gpx+xml');
}

// ============================================================
// KMLエクスポート
// ============================================================
export function generateKMLString(poiArray, lineArray = [], polygonArray = []) {
  const poiById = Object.fromEntries(poiArray.map(p => [p.id, p]));
  const color   = getCurrentColor();

  const header = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2">\n` +
    `<Document>\n  <name>Saved Locations</name>\n` +
    kmlStyleBlock(color) + '\n';

  const footer = `</Document></kml>`;

  const pointBody = poiArray.map(poi => {
    const fname = photoFilename(poi);
    return `
  <Placemark>
    <name>${poi.stake_type}${poi.number}</name>
    <TimeStamp><when>${poi.timestamp.toISOString()}</when></TimeStamp>
    <description>${poi.description}</description>
    <ExtendedData>
      <Data name="positioning"><value>${poi.positioning}</value></Data>${fname ? `\n      <Data name="photo_filename"><value>${fname}</value></Data>` : ''}
    </ExtendedData>
    <Point>
      <coordinates>${poi.latlng.lng},${poi.latlng.lat}</coordinates>
    </Point>
  </Placemark>`;
  }).join('');

  const lineBody = lineArray.map(line => {
    const pts = line.poiIds.map(id => poiById[id]).filter(Boolean);
    if (pts.length < 2) return '';
    const lineName = line.name || `${pts[0].stake_type}${pts[0].number}→${pts[pts.length-1].stake_type}${pts[pts.length-1].number}`;
    const coords = pts.map(p => `${p.latlng.lng},${p.latlng.lat}`).join('\n          ');
    const lineTs = line.timestamp ? `\n    <TimeStamp><when>${new Date(line.timestamp).toISOString()}</when></TimeStamp>` : '';
    return `
  <Placemark>
    <styleUrl>#lineStyle</styleUrl>
    <name>${lineName}</name>${lineTs}
    <LineString>
      <tessellate>1</tessellate>
      <coordinates>${coords}</coordinates>
    </LineString>
  </Placemark>`;
  }).join('');

  const polygonBody = polygonArray.map((f, i) => {
    const geom = f.geometry;
    if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return '';
    const rings = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    return rings.map((ring, ri) => {
      const outer = ring[0].map(c => `${c[0]},${c[1]}`).join('\n          ');
      const innerRings = ring.slice(1).map(hole =>
        `\n      <innerBoundaryIs><LinearRing><coordinates>${hole.map(c => `${c[0]},${c[1]}`).join(' ')}</coordinates></LinearRing></innerBoundaryIs>`
      ).join('');
      const polyName = (f.properties?.name || `ポリゴン${i + 1}`) + (rings.length > 1 ? `-${ri + 1}` : '');
      const polyDesc = f.properties?.description ? `\n    <description>${f.properties.description}</description>` : '';
      const polyTs = f.properties?.timestamp ? `\n    <TimeStamp><when>${new Date(f.properties.timestamp).toISOString()}</when></TimeStamp>` : '';
      return `\n  <Placemark>\n    <styleUrl>#polygonStyle</styleUrl>\n    <name>${polyName}</name>${polyTs}${polyDesc}\n    <Polygon><outerBoundaryIs><LinearRing><coordinates>${outer}</coordinates></LinearRing></outerBoundaryIs>${innerRings}</Polygon>\n  </Placemark>`;
    }).join('');
  }).join('');

  return header + pointBody + lineBody + polygonBody + footer;
}

export function exportToKML(poiArray, lineArray = [], polygonArray = [], filename = createFileName()) {
  if (guardEmpty(poiArray)) return;
  downloadFile(generateKMLString(poiArray, lineArray, polygonArray), filename + '.kml', 'application/vnd.google-earth.kml+xml');
}

// ============================================================
// KMZエクスポート（写真付き）
// ============================================================
export async function generateKMZBlob(poiArray, lineArray = [], polygonArray = []) {
  const poiById = Object.fromEntries(poiArray.map(p => [p.id, p]));
  const zip = new JSZip();
  const filesFolder = zip.folder('files');

  const photoMap = new Map(); // poi.id → filename
  for (const poi of poiArray) {
    if (!poi.photoId) continue;
    const fname = photoFilename(poi);
    const blob = await getPhotoFromDB(poi.photoId);
    if (blob && fname) {
      filesFolder.file(fname, blob);
      photoMap.set(poi.id, fname);
    }
  }

  const color  = getCurrentColor();
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2">\n` +
    `<Document>\n  <name>Saved Locations</name>\n` +
    kmlStyleBlock(color) + '\n';

  const footer = `</Document></kml>`;

  const pointBody = poiArray.map(poi => {
    const fname = photoMap.get(poi.id);
    const imgHtml = fname ? `<img src="files/${fname}" width="400"><br>` : '';
    const rawDesc = poi.description || '';
    const descContent = imgHtml + rawDesc;
    const descTag = descContent ? `\n    <description><![CDATA[${descContent}]]></description>` : '';
    return `
  <Placemark>
    <name>${poi.stake_type}${poi.number}</name>
    <TimeStamp><when>${poi.timestamp.toISOString()}</when></TimeStamp>${descTag}
    <ExtendedData>
      <Data name="positioning"><value>${poi.positioning}</value></Data>
    </ExtendedData>
    <Point>
      <coordinates>${poi.latlng.lng},${poi.latlng.lat}</coordinates>
    </Point>
  </Placemark>`;
  }).join('');

  const lineBody = lineArray.map(line => {
    const pts = line.poiIds.map(id => poiById[id]).filter(Boolean);
    if (pts.length < 2) return '';
    const lineName = line.name || `${pts[0].stake_type}${pts[0].number}→${pts[pts.length-1].stake_type}${pts[pts.length-1].number}`;
    const coords = pts.map(p => `${p.latlng.lng},${p.latlng.lat}`).join('\n          ');
    const lineTs = line.timestamp ? `\n    <TimeStamp><when>${new Date(line.timestamp).toISOString()}</when></TimeStamp>` : '';
    return `
  <Placemark>
    <styleUrl>#lineStyle</styleUrl>
    <name>${lineName}</name>${lineTs}
    <LineString>
      <tessellate>1</tessellate>
      <coordinates>${coords}</coordinates>
    </LineString>
  </Placemark>`;
  }).join('');

  const polygonBody = polygonArray.map((f, i) => {
    const geom = f.geometry;
    if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return '';
    const rings = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    return rings.map((ring, ri) => {
      const outer = ring[0].map(c => `${c[0]},${c[1]}`).join('\n          ');
      const innerRings = ring.slice(1).map(hole =>
        `\n      <innerBoundaryIs><LinearRing><coordinates>${hole.map(c => `${c[0]},${c[1]}`).join(' ')}</coordinates></LinearRing></innerBoundaryIs>`
      ).join('');
      const polyName = (f.properties?.name || `ポリゴン${i + 1}`) + (rings.length > 1 ? `-${ri + 1}` : '');
      const polyDesc = f.properties?.description ? `\n    <description>${f.properties.description}</description>` : '';
      const polyTs = f.properties?.timestamp ? `\n    <TimeStamp><when>${new Date(f.properties.timestamp).toISOString()}</when></TimeStamp>` : '';
      return `\n  <Placemark>\n    <styleUrl>#polygonStyle</styleUrl>\n    <name>${polyName}</name>${polyTs}${polyDesc}\n    <Polygon><outerBoundaryIs><LinearRing><coordinates>${outer}</coordinates></LinearRing></outerBoundaryIs>${innerRings}</Polygon>\n  </Placemark>`;
    }).join('');
  }).join('');

  zip.file('doc.kml', header + pointBody + lineBody + polygonBody + footer);
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  // Android Chrome はZIPマジックバイトを検出して .zip を付加するため octet-stream で返す
  return new Blob([zipBlob], { type: 'application/octet-stream' });
}

export async function exportToKMZ(poiArray, lineArray = [], polygonArray = [], filename = createFileName()) {
  if (guardEmpty(poiArray)) return;
  const blob = await generateKMZBlob(poiArray, lineArray, polygonArray);
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: filename + '.kmz',
  });
  a.click();
}

// ============================================================
// GeoJSONエクスポート
// ============================================================
export function generateGeoJSONString(poiArray, lineArray = [], polygonArray = []) {
  const poiById = Object.fromEntries(poiArray.map(p => [p.id, p]));
  const features = [];

  poiArray.forEach(poi => {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [poi.latlng.lng, poi.latlng.lat] },
      properties: {
        number:         (poi.stake_type || '') + (poi.number ?? ''),
        description:    poi.description || '',
        positioning:    poi.positioning || 'unknown',
        timestamp:      poi.timestamp.toISOString(),
        photo_filename: photoFilename(poi) || '',
      },
    });
  });

  lineArray.forEach(line => {
    const coords = line.poiIds
      .map(id => poiById[id])
      .filter(Boolean)
      .map(p => [p.latlng.lng, p.latlng.lat]);
    if (coords.length < 2) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {
        name:        line.name || '',
        description: line.description || '',
        timestamp:   line.timestamp || null,
        points: line.poiIds
          .map(id => poiById[id])
          .filter(Boolean)
          .map(p => (p.stake_type || '') + (p.number ?? ''))
          .join(' → '),
      },
    });
  });

  // geometry と properties のみ抽出（Leaflet レイヤー参照など非シリアライズ可能なフィールドを除外）
  polygonArray.forEach(f => {
    if (!f?.geometry) return;
    features.push({ type: 'Feature', geometry: f.geometry, properties: f.properties ?? {} });
  });

  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}

export function exportToGeoJSON(poiArray, lineArray = [], polygonArray = [], filename = createFileName()) {
  if (guardEmpty(poiArray)) return;
  downloadFile(generateGeoJSONString(poiArray, lineArray, polygonArray), filename + '.geojson', 'application/geo+json');
}