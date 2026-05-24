// ============================================================
// photo_manager.js — 写真撮影・保存・EXIF書き込み・ダウンロード
// ============================================================
import piexif from 'piexifjs';
import JSZip from 'jszip';
import { savePhotoToDB, getPhotoFromDB } from './indexedDB_poi_storage.js';

let _onPhotoCaptured = null;

// ============================================================
// 初期化
// ============================================================
export function initPhotoManager({ onPhotoCaptured }) {
  _onPhotoCaptured = onPhotoCaptured;
}

// ============================================================
// カメラ起動・写真取得
// ============================================================

/**
 * カメラを起動して写真を撮影し、POI登録コールバックを呼ぶ
 * @param {'current'|'center'} positionType
 * @param {() => {lat, lng, elevation}} getPosition
 */
export function capturePhotoForPosition(positionType, getPosition) {
  const indicator = document.getElementById('photo-mode-indicator');
  if (indicator) indicator.style.display = 'block';

  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = 'image/*';
  input.setAttribute('capture', 'environment');

  input.onchange = async (e) => {
    if (indicator) indicator.style.display = 'none';
    const file = e.target.files?.[0];
    if (!file) return;
    const position = getPosition();
    if (!position) { alert('位置情報が取得できていません。'); return; }
    const photoId = await savePhotoToDB(file);
    if (_onPhotoCaptured) _onPhotoCaptured(photoId, position, positionType);
  };

  // ファイル選択キャンセル時もインジケーターを消す
  const hideOnFocus = () => {
    setTimeout(() => { if (indicator) indicator.style.display = 'none'; }, 500);
  };
  window.addEventListener('focus', hideOnFocus, { once: true });

  input.click();
}

// ============================================================
// 写真の表示
// ============================================================

/**
 * IndexedDBから写真BlobをObject URLとして取得する
 * 呼び出し元は不要になったら URL.revokeObjectURL() すること
 */
export async function getPhotoObjectURL(photoId) {
  const blob = await getPhotoFromDB(photoId);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

// ============================================================
// EXIF書き込み＆ダウンロード
// ============================================================

/**
 * EXIFに位置情報・備考を書き込んで写真をダウンロードする
 */
export async function downloadPhotoWithExif(photoId, poi) {
  const blob = await getPhotoFromDB(photoId);
  if (!blob) { alert('写真データが見つかりません。'); return; }

  const dataUrl = await blobToDataUrl(blob);
  let resultDataUrl = dataUrl;

  try {
    const exifObj = buildExifObj(poi, dataUrl);
    const exifStr = piexif.dump(exifObj);
    resultDataUrl = piexif.insert(exifStr, dataUrl);
  } catch (e) {
    console.warn('EXIF書き込みに失敗しました（写真はそのままダウンロードします）:', e);
  }

  const outBlob  = dataUrlToBlob(resultDataUrl);
  const filename = `${formatDateForFilename(poi.timestamp)}.jpg`;
  triggerDownload(outBlob, filename);
}

// ============================================================
// 写真一括ダウンロード（ZIP）
// ============================================================

/**
 * 写真付きPOIの写真をすべてEXIF付きZIPのBlobとして返す
 * @param {Array} poiArray
 * @returns {Promise<Blob|null>} 写真がない場合はnull（alertも発火）
 */
export async function generatePhotosZipBlob(poiArray) {
  const photoPOIs = poiArray.filter(p => p.photoId);
  if (photoPOIs.length === 0) {
    alert('写真付きのPOIがありません。');
    return null;
  }

  const zip = new JSZip();

  for (const poi of photoPOIs) {
    const blob = await getPhotoFromDB(poi.photoId);
    if (!blob) continue;

    const dataUrl = await blobToDataUrl(blob);
    let resultDataUrl = dataUrl;
    try {
      const exifObj = buildExifObj(poi, dataUrl);
      const exifStr = piexif.dump(exifObj);
      resultDataUrl = piexif.insert(exifStr, dataUrl);
    } catch (e) {
      console.warn('EXIF書き込みエラー（写真はそのまま追加します）:', e);
    }

    const outBlob  = dataUrlToBlob(resultDataUrl);
    const filename = `${formatDateForFilename(poi.timestamp)}.jpg`;
    zip.file(filename, outBlob);
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * 写真付きPOIの写真をすべてEXIF付きZIPにまとめてダウンロードする
 * @param {Array} poiArray
 */
export async function downloadAllPhotosAsZip(poiArray, filename) {
  const zipBlob = await generatePhotosZipBlob(poiArray);
  if (!zipBlob) return;
  const name = filename ? `${filename}.zip` : `photos_${formatDateForFilename(new Date())}.zip`;
  triggerDownload(zipBlob, name);
}

// ============================================================
// 内部ユーティリティ
// ============================================================

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader  = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime  = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bytes = atob(data);
  const arr   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildExifObj(poi, dataUrl) {
  const exifObj = { '0th': {}, 'Exif': {}, 'GPS': {} };

  // 既存EXIFをマージ（カメラメタデータのみ。GPSはアプリのPOI座標で完全上書き）
  try {
    const existing = piexif.load(dataUrl);
    Object.assign(exifObj['0th'],  existing['0th']  || {});
    Object.assign(exifObj['Exif'], existing['Exif'] || {});
    // GPS は意図的にマージしない
  } catch (_) { /* 既存EXIFなし */ }

  // ImageDescription（備考）
  if (poi.description) {
    exifObj['0th'][piexif.ImageIFD.ImageDescription] = poi.description;
  }

  // DateTime
  const ts      = poi.timestamp instanceof Date ? poi.timestamp : new Date(poi.timestamp);
  const dateStr = ts.toISOString().replace('T', ' ').substring(0, 19).replace(/-/g, ':');
  exifObj['0th'][piexif.ImageIFD.DateTime] = dateStr;

  // GPS
  const latlng = poi.latlng;
  if (latlng) {
    const lat = latlng.lat;
    const lng = latlng.lng;

    exifObj['GPS'][piexif.GPSIFD.GPSLatitudeRef]  = lat >= 0 ? 'N' : 'S';
    exifObj['GPS'][piexif.GPSIFD.GPSLatitude]     = degToDMS(Math.abs(lat));
    exifObj['GPS'][piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W';
    exifObj['GPS'][piexif.GPSIFD.GPSLongitude]    = degToDMS(Math.abs(lng));

    const alt = poi.elevation;
    if (alt != null) {
      exifObj['GPS'][piexif.GPSIFD.GPSAltitudeRef] = alt >= 0 ? 0 : 1;
      exifObj['GPS'][piexif.GPSIFD.GPSAltitude]    = [Math.round(Math.abs(alt) * 100), 100];
    }

    exifObj['GPS'][piexif.GPSIFD.GPSDateStamp] = ts.toISOString().substring(0, 10).replace(/-/g, ':');
    exifObj['GPS'][piexif.GPSIFD.GPSTimeStamp] = [
      [ts.getUTCHours(),   1],
      [ts.getUTCMinutes(), 1],
      [ts.getUTCSeconds(), 1],
    ];
  }

  return exifObj;
}

function degToDMS(deg) {
  const d      = Math.floor(deg);
  const mFloat = (deg - d) * 60;
  const m      = Math.floor(mFloat);
  const s      = Math.round((mFloat - m) * 60 * 100);
  return [[d, 1], [m, 1], [s, 100]];
}

function formatDateForFilename(ts) {
  const d   = ts instanceof Date ? ts : new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
