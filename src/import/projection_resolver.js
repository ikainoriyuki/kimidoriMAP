import proj4 from 'proj4';

// ============================================================
// 日本の平面直角座標系（JGD2011 / JGD2000）の内蔵定義
// ============================================================

// EPSG:6669〜6687 = JGD2011 第I〜XIX系
// EPSG:2443〜2461 = JGD2000 平面直角
export const JAPAN_PLANE_DEFS = {
  'EPSG:6669': '+proj=tmerc +lat_0=33 +lon_0=129.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6670': '+proj=tmerc +lat_0=33 +lon_0=131 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6671': '+proj=tmerc +lat_0=36 +lon_0=132.1666666667 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6672': '+proj=tmerc +lat_0=33 +lon_0=133.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6673': '+proj=tmerc +lat_0=36 +lon_0=134.3333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6674': '+proj=tmerc +lat_0=36 +lon_0=136 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6675': '+proj=tmerc +lat_0=36 +lon_0=137.1666666667 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6676': '+proj=tmerc +lat_0=36 +lon_0=138.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6677': '+proj=tmerc +lat_0=36 +lon_0=139.8333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6678': '+proj=tmerc +lat_0=40 +lon_0=140.8333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6679': '+proj=tmerc +lat_0=44 +lon_0=140.25 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6680': '+proj=tmerc +lat_0=44 +lon_0=142.25 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6681': '+proj=tmerc +lat_0=44 +lon_0=144.25 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6682': '+proj=tmerc +lat_0=26 +lon_0=142 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6683': '+proj=tmerc +lat_0=26 +lon_0=127.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6684': '+proj=tmerc +lat_0=26 +lon_0=124 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6685': '+proj=tmerc +lat_0=26 +lon_0=131 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6686': '+proj=tmerc +lat_0=20 +lon_0=136 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:6687': '+proj=tmerc +lat_0=26 +lon_0=154 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2443': '+proj=tmerc +lat_0=33 +lon_0=129.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2444': '+proj=tmerc +lat_0=33 +lon_0=131 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2445': '+proj=tmerc +lat_0=36 +lon_0=132.1666666667 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2446': '+proj=tmerc +lat_0=33 +lon_0=133.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2447': '+proj=tmerc +lat_0=36 +lon_0=134.3333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2448': '+proj=tmerc +lat_0=36 +lon_0=136 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2449': '+proj=tmerc +lat_0=36 +lon_0=137.1666666667 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2450': '+proj=tmerc +lat_0=36 +lon_0=138.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2451': '+proj=tmerc +lat_0=36 +lon_0=139.8333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2452': '+proj=tmerc +lat_0=40 +lon_0=140.8333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2453': '+proj=tmerc +lat_0=44 +lon_0=140.25 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2454': '+proj=tmerc +lat_0=44 +lon_0=142.25 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:2455': '+proj=tmerc +lat_0=44 +lon_0=144.25 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs',
};

// 起動時に内蔵定義を proj4 に登録
Object.entries(JAPAN_PLANE_DEFS).forEach(([key, def]) => proj4.defs(key, def));

/**
 * PRJ の WKT から変換元の proj4 定義キーを解決する。
 *
 * 優先順位:
 *   1. AUTHORITY["EPSG","XXXX"] がある → 内蔵定義 or epsg.io
 *   2. AUTHORITY がない → PARAMETER から内蔵定義と照合
 *   3. それでも不明 → WKT を proj4 に直接渡す
 *   4. WGS84 系 → 変換不要（null）
 */
export async function resolveProjFromWkt(wkt) {
  if (!wkt) return null;

  // ── 1. AUTHORITY["EPSG","XXXX"] がある場合 ──
  const allMatches = [...wkt.matchAll(/AUTHORITY\["EPSG","(\d+)"\]/gi)];
  if (allMatches.length > 0) {
    const epsgCode = allMatches[allMatches.length - 1][1];
    const key = `EPSG:${epsgCode}`;

    if (['4326', '6668', '4612'].includes(epsgCode)) return null;

    if (JAPAN_PLANE_DEFS[key]) {
      console.log(`内蔵定義で変換: ${key}`);
      return key;
    }

    if (!proj4.defs(key)) {
      try {
        const res = await fetch(`https://epsg.io/${epsgCode}.proj4`);
        if (res.ok) {
          const def = (await res.text()).trim();
          if (def.startsWith('+')) {
            proj4.defs(key, def);
            console.log(`epsg.io から登録: ${key}`);
          }
        }
      } catch (e) {
        console.warn(`epsg.io 取得失敗 (${key}):`, e);
      }
    }
    if (proj4.defs(key)) return key;
  }

  // ── 2. AUTHORITY なし → PARAMETER から内蔵定義と照合 ──
  const isTM     = /Transverse_Mercator/i.test(wkt);
  const lonMatch = wkt.match(/Central_Meridian["\s,\]]*,\s*([\d.]+)/i);
  const latMatch = wkt.match(/Latitude_Of_Origin["\s,\]]*,\s*([\d.]+)/i);

  if (isTM && lonMatch) {
    const lon0 = parseFloat(lonMatch[1]);
    const lat0 = latMatch ? parseFloat(latMatch[1]) : null;

    for (const [key, def] of Object.entries(JAPAN_PLANE_DEFS)) {
      const defLon = def.match(/lon_0=([\d.]+)/)?.[1];
      const defLat = def.match(/lat_0=([\d.]+)/)?.[1];
      if (!defLon) continue;

      const lonMatch2 = Math.abs(parseFloat(defLon) - lon0) < 0.0001;
      const latMatch2 = !lat0 || !defLat || Math.abs(parseFloat(defLat) - lat0) < 0.0001;

      if (lonMatch2 && latMatch2) {
        console.log(`PARAMETERから内蔵定義で変換: ${key} (lon_0=${lon0})`);
        return key;
      }
    }
  }

  // ── 3. WKT を proj4 に直接渡す（ESRI 形式など） ──
  if (wkt.includes('PROJCS') || wkt.includes('GEOGCS')) {
    if (/GCS_WGS_1984|WGS.?84/i.test(wkt) && !wkt.includes('PROJCS')) return null;

    try {
      const key = 'WKT_CUSTOM_' + Date.now();
      proj4.defs(key, wkt);
      console.log(`WKT を proj4 に直接登録して変換`);
      return key;
    } catch (e) {
      console.warn('proj4 WKT 直接パース失敗:', e);
    }
  }

  // ── 4. 変換不要（地理座標系 WGS84 など） ──
  if (/WGS.?84|GCS_WGS_1984/i.test(wkt)) return null;

  console.warn('PRJ の座標系を特定できませんでした。変換なしで表示します。');
  return null;
}

/**
 * GeoJSON の crs プロパティから変換元の proj4 定義キーを解決する。
 *
 * 対応フォーマット:
 *   - { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::2449" } }
 *   - { "type": "name", "properties": { "name": "EPSG:2449" } }
 * WGS84 系（EPSG:4326 / CRS84 等）は変換不要として null を返す。
 */
export async function resolveGeoJSONCRS(crs) {
  if (!crs || crs.type !== 'name') return null;
  const name = crs.properties?.name ?? '';
  if (!name) return null;

  // OGC CRS84（WGS84 経度・緯度）
  if (/CRS84|CRS:84/i.test(name)) return null;

  // EPSG コードを抽出: "urn:ogc:def:crs:EPSG::2449" or "EPSG:2449"
  const epsgMatch = name.match(/EPSG[:\s]+:?(\d+)/i);
  if (!epsgMatch) {
    console.warn('GeoJSON CRS: EPSG コードを取得できませんでした:', name);
    return null;
  }
  const epsgCode = epsgMatch[1];
  const key = `EPSG:${epsgCode}`;

  if (['4326', '4612', '6668'].includes(epsgCode)) return null;

  if (JAPAN_PLANE_DEFS[key]) {
    console.log(`GeoJSON CRS: 内蔵定義で変換: ${key}`);
    return key;
  }

  if (!proj4.defs(key)) {
    try {
      const res = await fetch(`https://epsg.io/${epsgCode}.proj4`);
      if (res.ok) {
        const def = (await res.text()).trim();
        if (def.startsWith('+')) {
          proj4.defs(key, def);
          console.log(`GeoJSON CRS: epsg.io から登録: ${key}`);
        }
      }
    } catch (e) {
      console.warn(`GeoJSON CRS: epsg.io 取得失敗 (${key}):`, e);
    }
  }

  if (proj4.defs(key)) return key;

  console.warn(`GeoJSON CRS: 座標系を解決できませんでした: ${name}`);
  return null;
}

/**
 * GeoJSON の全座標を srcProj → WGS84 に変換する。
 */
export function reprojectGeoJSON(geojson, srcProj) {
  if (!srcProj) return geojson;

  const converter = proj4(srcProj, 'WGS84');

  function cvtCoord(coord) {
    const [lng, lat] = converter.forward([coord[0], coord[1]]);
    return coord.length > 2 ? [lng, lat, coord[2]] : [lng, lat];
  }

  function cvtGeom(geom) {
    if (!geom) return geom;
    switch (geom.type) {
      case 'Point':
        return { ...geom, coordinates: cvtCoord(geom.coordinates) };
      case 'MultiPoint':
      case 'LineString':
        return { ...geom, coordinates: geom.coordinates.map(cvtCoord) };
      case 'MultiLineString':
      case 'Polygon':
        return { ...geom, coordinates: geom.coordinates.map(r => r.map(cvtCoord)) };
      case 'MultiPolygon':
        return { ...geom, coordinates: geom.coordinates.map(p => p.map(r => r.map(cvtCoord))) };
      case 'GeometryCollection':
        return { ...geom, geometries: geom.geometries.map(cvtGeom) };
      default:
        return geom;
    }
  }

  return {
    ...geojson,
    features: geojson.features.map(f => ({ ...f, geometry: cvtGeom(f.geometry) })),
  };
}
