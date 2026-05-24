import { parseShp, parseDbf, combine } from 'shpjs';
import JSZip from 'jszip';
import { resolveProjFromWkt, reprojectGeoJSON } from './projection_resolver.js';

// shpjs がポリゴンを LineString/MultiLineString で返す場合にPolygonへ変換する
function isClosedRing(coords) {
  if (coords.length < 4) return false;
  return coords[0][0] === coords.at(-1)[0] && coords[0][1] === coords.at(-1)[1];
}

function fixClosedLineStrings(geojson) {
  return {
    ...geojson,
    features: geojson.features.map(f => {
      const geom = f.geometry;
      if (!geom) return f;
      if (geom.type === 'LineString' && isClosedRing(geom.coordinates)) {
        return { ...f, geometry: { type: 'Polygon', coordinates: [geom.coordinates] } };
      }
      if (geom.type === 'MultiLineString' && geom.coordinates.every(isClosedRing)) {
        return { ...f, geometry: { type: 'Polygon', coordinates: geom.coordinates } };
      }
      return f;
    }),
  };
}

// ============================================================
// Shapefile 読み込み＋座標変換
// ============================================================

/**
 * shpjs でパースした GeoJSON を PRJ にもとづいて WGS84 に変換し登録する。
 * @param {ArrayBuffer} shpBuf
 * @param {ArrayBuffer|null} dbfBuf
 * @param {string|null} prjText
 * @param {string} fileName
 * @param {function} onRegister - registerLayer(data, fileName) コールバック
 */
export async function loadAndReprojectShp(shpBuf, dbfBuf, prjText, fileName, onRegister, onProgress) {
  const progress = onProgress ?? (() => {});
  try {
    progress('Shapefile を解析中…');
    const parsed  = parseShp(shpBuf);
    const attrs   = dbfBuf ? parseDbf(dbfBuf) : [];
    const geojson = combine([parsed, attrs]);

    if (!geojson?.features?.length) { alert('データが空です。'); return; }

    console.log('PRJ テキスト:', prjText ? prjText.substring(0, 80) : 'null');
    const srcProj = await resolveProjFromWkt(prjText);
    console.log('解決された srcProj:', srcProj);

    if (srcProj) {
      progress('座標を変換中…');
      console.log(`座標変換: ${srcProj} → WGS84`);
    } else {
      console.warn('座標変換なし（WGS84として扱う）');
    }

    const reprojected = fixClosedLineStrings(reprojectGeoJSON(geojson, srcProj));
    await onRegister(reprojected, fileName);
  } catch (err) {
    alert('Shapefile の変換に失敗しました。');
    console.error(err);
  }
}

/**
 * ZIP（shp+dbf+prj をまとめたもの）を読み込む。
 * @param {File} file
 * @param {function} onRegister - registerLayer(data, fileName) コールバック
 */
export async function loadShapefileZip(file, onRegister, onProgress) {
  const progress = onProgress ?? (() => {});
  try {
    progress('ZIPを展開中…');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());

    const shpEntries = Object.keys(zip.files).filter(n => n.toLowerCase().endsWith('.shp'));
    if (shpEntries.length === 0) { alert('ZIP 内に .shp が見つかりません。'); return; }

    for (const shpName of shpEntries) {
      const base   = shpName.replace(/\.shp$/i, '');
      const dbfKey = Object.keys(zip.files).find(n => n.toLowerCase() === (base + '.dbf').toLowerCase());
      const prjKey = Object.keys(zip.files).find(n => n.toLowerCase() === (base + '.prj').toLowerCase());

      const shpBuf = await zip.files[shpName].async('arraybuffer');
      const dbfBuf = dbfKey ? await zip.files[dbfKey].async('arraybuffer') : null;
      const prjTxt = prjKey ? await zip.files[prjKey].async('string')      : null;

      await loadAndReprojectShp(shpBuf, dbfBuf, prjTxt, base.split('/').pop() + '.shp', onRegister, progress);
    }
  } catch (err) {
    alert('Shapefile の読み込みに失敗しました。');
    console.error('Shapefile ZIP エラー:', err);
  }
}

/**
 * フォルダ選択（webkitdirectory）で取得した全ファイルから
 * .shp ごとにベース名でグループ化し、対応する .dbf / .prj を自動で組み合わせる。
 * @param {Event} event - input[type=file] の change イベント
 * @param {function} onRegister - registerLayer(data, fileName) コールバック
 */
export async function loadFolder(event, onRegister, onProgress) {
  const progress = onProgress ?? (() => {});
  const files = Array.from(event.target.files);
  event.target.value = '';
  if (!files.length) return;

  progress('ファイルを読み込み中…');

  const groups = {};
  for (const f of files) {
    const parts = f.name.split('.');
    const ext   = parts.pop().toLowerCase();
    const base  = parts.join('.');
    if (!groups[base]) groups[base] = {};
    groups[base][ext] = f;
  }

  const shpGroups = Object.entries(groups).filter(([, g]) => g.shp);
  if (shpGroups.length === 0) {
    alert('.shp ファイルが見つかりません。');
    return;
  }

  for (const [base, g] of shpGroups) {
    const shpBuf = await g.shp.arrayBuffer();
    const dbfBuf = g.dbf ? await g.dbf.arrayBuffer() : null;
    const prjTxt = g.prj ? await g.prj.text()        : null;

    console.log(`読み込み: ${base}.shp, PRJ: ${prjTxt ? 'あり' : 'なし'}`);
    if (prjTxt) console.log('PRJ:', prjTxt.substring(0, 100));

    await loadAndReprojectShp(shpBuf, dbfBuf, prjTxt, g.shp.name, onRegister, progress);
  }
}
