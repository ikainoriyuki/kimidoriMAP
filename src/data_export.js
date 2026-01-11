// POIデータ受け取り
export function initDataExport(getPOIArray) {
  document.getElementById('exportGpxBtn').addEventListener('click', () =>
    exportToGPX(getPOIArray())
  );
  document.getElementById('exportKmlBtn').addEventListener('click', () =>
    exportToKML(getPOIArray())
  );
  document.getElementById('exportGeoJSONBtn').addEventListener('click', () =>
    exportToGeoJSON(getPOIArray())
  );
}

// ファイル名作成
function createFileName() {
  let now = new Date();
  let parts = [
    now.getFullYear(), 
    ('0' + (now.getMonth() + 1)).slice(-2), 
    ('0' + now.getDate()).slice(-2),
    ('0' + now.getHours()).slice(-2),
    ('0' + now.getMinutes()).slice(-2),
    ('0' + now.getSeconds()).slice(-2)
  ];
  return `${parts[0]}${parts[1]}${parts[2]}_${parts[3]}${parts[4]}${parts[5]}_locations`;
}

// ファイルダウンロード
function downloadFile(content, fileName, contentType) {
  let blob = new Blob([content], { type: contentType });
  let a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
}

// GPXエクスポート
function exportToGPX(poiArray) {
  if (poiArray.length === 0) { alert("保存された現在地がありません！"); return; }
  let gpxHeader = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
    <gpx version="1.1" creator="Noriyuki IKAI" xmlns="http://www.topografix.com/GPX/1/1">
    <trk><name>Saved Locations</name><trkseg>\n`;
  let gpxFooter = `</trkseg></trk></gpx>`;
  let gpxBody = poiArray.map(poi => `
    <trkpt lat="${poi.latlng.lat}" lon="${poi.latlng.lng}">
      <time>${poi.timestamp.toISOString()}</time>
      <name>${poi.stake_type}${poi.number}</name>
      <desc>${poi.description}</desc>
      <src>${poi.positioning}</src>
    </trkpt>`).join("\n");
  let gpxContent = gpxHeader + gpxBody + gpxFooter;
  downloadFile(gpxContent, createFileName() + ".gpx", "application/gpx+xml");
}

// KMLエクスポート
function exportToKML(poiArray) {
  if (poiArray.length === 0) { alert("保存された現在地がありません！"); return; }
  let kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
      <name>Saved Locations</name>\n`;
  let kmlFooter = `</Document></kml>`;
  let kmlBody = poiArray.map(poi => `
      <Placemark>
        <name>${poi.stake_type}${poi.number}</name>
        <TimeStamp><when>${poi.timestamp.toISOString()}</when></TimeStamp>
        <description>${poi.description}</description>
        <ExtendedData>
          <Data name="positioning">
            <value>${poi.positioning}</value>
          </Data>
        </ExtendedData>
        <Point>
          <coordinates>${poi.latlng.lng},${poi.latlng.lat}</coordinates>
        </Point>
      </Placemark>`).join("\n");
  let kmlContent = kmlHeader + kmlBody + kmlFooter;
  downloadFile(kmlContent, createFileName() + ".kml", "application/vnd.google-earth.kml+xml");
}

// GeoJSONエクスポート
function exportToGeoJSON(poiArray) {
  if (poiArray.length === 0) { alert("保存された現在地がありません！"); return; }
  let geojson = {
    type: "FeatureCollection",
    features: poiArray.map(poi => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [poi.latlng.lng, poi.latlng.lat]
      },
      properties: {
        number: poi.stake_type + poi.number || null,
        description: poi.description || "",
        positioning: poi.positioning || "unknown",
        timestamp: poi.timestamp.toISOString()
      }
    }))
  };
  let geojsonContent = JSON.stringify(geojson, null, 2);
  downloadFile(geojsonContent, createFileName() + ".geojson", "application/geo+json");
}