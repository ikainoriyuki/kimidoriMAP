// ============================================================
// indexedDB_poi_storage.js — POIデータの永続化（IndexedDB）
// ============================================================

const DB_NAME         = 'POIDatabase';
const STORE_NAME      = 'POIStore';
const PHOTO_STORE     = 'PhotoStore';
const POLYGON_STORE   = 'PolygonStore';
const LINE_STORE      = 'LineStore';
const DB_VERSION      = 6;

let db;
let _dbPromise = null;

// ============================================================
// DB初期化
// ============================================================
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('number',    'number',    { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!database.objectStoreNames.contains(PHOTO_STORE)) {
        database.createObjectStore(PHOTO_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!database.objectStoreNames.contains(POLYGON_STORE)) {
        database.createObjectStore(POLYGON_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!database.objectStoreNames.contains(LINE_STORE)) {
        database.createObjectStore(LINE_STORE, { keyPath: 'id' });
      }
    };

    req.onsuccess = e => {
      db = e.target.result;
      db.onversionchange = () => { db.close(); db = null; _dbPromise = null; };
      resolve(db);
    };
    req.onblocked = () => { console.warn('IndexedDB upgrade blocked — 他のタブを閉じてください'); };
    req.onerror   = e => {
      _dbPromise = null;
      console.error('IndexedDB オープンエラー:', e.target.error);
      reject(e.target.error);
    };
  });
  return _dbPromise;
}

// ============================================================
// 公開API
// ============================================================

/** 全POIを読み込む */
export async function loadAllPOI() {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => { console.error('POI読み込みエラー:', e.target.error); reject(e.target.error); };
  });
}

/** POI配列全体を保存する（全削除→全追加） */
export async function savePOIArrayToDB(poiArray) {
  if (!db) await openDB();
  await clearAllPOI();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let saved   = 0;

    if (poiArray.length === 0) { resolve(); return; }

    poiArray.forEach(poi => {
      const record = {
        ...(poi.id && { id: poi.id }),
        latlng:      poi.latlng,
        timestamp:   poi.timestamp instanceof Date ? poi.timestamp.toISOString() : poi.timestamp,
        positioning: poi.positioning,
        stake_type:  poi.stake_type,
        number:      poi.number,
        description: poi.description,
        lineFrom:    poi.lineFrom ?? null,
        labelMode:   poi.labelMode ?? null, // 'number' | 'description' | null
        elevation:   poi.elevation  ?? null,
        photoId:     poi.photoId    ?? null,
      };

      const req = store.put(record);
      req.onsuccess = e => {
        if (!poi.id) poi.id = e.target.result; // autoIncrementのIDを反映
        if (++saved === poiArray.length) resolve();
      };
      req.onerror = e => { console.error('POI保存エラー:', e.target.error); reject(e.target.error); };
    });
  });
}

/** 指定POIを削除する */
export async function deletePOIFromDB(poiId) {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).delete(poiId);
    req.onsuccess = () => resolve();
    req.onerror   = e => { console.error('POI削除エラー:', e.target.error); reject(e.target.error); };
  });
}

/** 全POIをクリアする */
export async function clearAllPOI() {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror   = e => { console.error('POI全削除エラー:', e.target.error); reject(e.target.error); };
  });
}

// ============================================================
// 写真ストア（PhotoStore）
// ============================================================

/** 写真BlobをPhotoStoreに保存し、採番されたIDを返す */
export async function savePhotoToDB(blob) {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction([PHOTO_STORE], 'readwrite')
      .objectStore(PHOTO_STORE)
      .add({ blob, timestamp: new Date().toISOString() });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => { console.error('写真保存エラー:', e.target.error); reject(e.target.error); };
  });
}

/** 指定IDの写真Blobを取得する */
export async function getPhotoFromDB(photoId) {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction([PHOTO_STORE], 'readonly')
      .objectStore(PHOTO_STORE)
      .get(photoId);
    req.onsuccess = () => resolve(req.result?.blob ?? null);
    req.onerror   = e => { console.error('写真取得エラー:', e.target.error); reject(e.target.error); };
  });
}

// ============================================================
// ポリゴンストア（PolygonStore）
// ============================================================

/** ポリゴンレコードを1件保存し、採番されたIDを返す */
export async function savePolygonToDB(record) {
  if (!db) await openDB();
  if (!db.objectStoreNames.contains(POLYGON_STORE)) return null;
  return new Promise((resolve, reject) => {
    const req = db.transaction([POLYGON_STORE], 'readwrite')
      .objectStore(POLYGON_STORE).add(record);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => { console.error('ポリゴン保存エラー:', e.target.error); reject(e.target.error); };
  });
}

/** 全ポリゴンを読み込む */
export async function loadAllPolygons() {
  if (!db) await openDB();
  if (!db.objectStoreNames.contains(POLYGON_STORE)) return [];
  return new Promise((resolve, reject) => {
    const req = db.transaction([POLYGON_STORE], 'readonly').objectStore(POLYGON_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => { console.error('ポリゴン読み込みエラー:', e.target.error); reject(e.target.error); };
  });
}

/** 指定IDのポリゴンを更新する */
export async function updatePolygonInDB(record) {
  if (!db) await openDB();
  if (!db.objectStoreNames.contains(POLYGON_STORE)) return;
  return new Promise((resolve, reject) => {
    const req = db.transaction([POLYGON_STORE], 'readwrite')
      .objectStore(POLYGON_STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror   = e => { console.error('ポリゴン更新エラー:', e.target.error); reject(e.target.error); };
  });
}

/** 全ポリゴンをクリアする */
export async function clearAllPolygons() {
  if (!db) await openDB();
  if (!db.objectStoreNames.contains(POLYGON_STORE)) return;
  return new Promise((resolve, reject) => {
    const req = db.transaction([POLYGON_STORE], 'readwrite').objectStore(POLYGON_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror   = e => { console.error('ポリゴン全削除エラー:', e.target.error); reject(e.target.error); };
  });
}

/** 指定IDのポリゴンを削除する */
export async function deletePolygonFromDB(id) {
  if (!db) await openDB();
  if (!db.objectStoreNames.contains(POLYGON_STORE)) return;
  return new Promise((resolve, reject) => {
    const req = db.transaction([POLYGON_STORE], 'readwrite').objectStore(POLYGON_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => { console.error('ポリゴン削除エラー:', e.target.error); reject(e.target.error); };
  });
}

// ============================================================
// ラインストア（LineStore）
// ============================================================

/** 全ラインを読み込む */
export async function loadAllLines() {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction([LINE_STORE], 'readonly').objectStore(LINE_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => { console.error('ライン読み込みエラー:', e.target.error); reject(e.target.error); };
  });
}

/** ライン配列全体を保存する（全削除→全追加を1トランザクションで） */
export async function saveAllLinesToDB(lines) {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction([LINE_STORE], 'readwrite');
    const store = tx.objectStore(LINE_STORE);
    store.clear();
    lines.forEach(l => store.put({
      id:              l.id,
      poiIds:          l.poiIds          || [],
      vertices:        l.vertices        || [],
      importedLatlngs: l.importedLatlngs || null,
      name:            l.name            || '',
      description:     l.description     || '',
      timestamp:       l.timestamp       || null,
    }));
    tx.oncomplete = () => resolve();
    tx.onerror    = e => { console.error('ライン保存エラー:', e.target.error); reject(e.target.error); };
  });
}

/** 指定IDの写真を削除する */
export async function deletePhotoFromDB(photoId) {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction([PHOTO_STORE], 'readwrite')
      .objectStore(PHOTO_STORE)
      .delete(photoId);
    req.onsuccess = () => resolve();
    req.onerror   = e => { console.error('写真削除エラー:', e.target.error); reject(e.target.error); };
  });
}