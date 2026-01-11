const DB_NAME = 'POIDatabase';
const STORE_NAME = 'POIStore';
const DB_VERSION = 1;

let db;

/**
 * IndexedDBをオープンし、オブジェクトストアを作成します。
 * @returns {Promise<IDBDatabase>} データベースインスタンス
 */
function openDB() {
  return new Promise((resolve, reject) => {
    // 互換性のためにベンダープレフィックスを考慮
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // オブジェクトストアを作成し、'number'をインデックスとして定義
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        objectStore.createIndex('number', 'number', { unique: false });
        // 'timestamp'もインデックスとして定義すると読み込み時にソートが効率的になる
        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      console.error("IndexedDB open error:", event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * 全てのPOIをIndexedDBから読み込みます。
 * @returns {Promise<Array<Object>>} POIオブジェクトの配列
 */
export async function loadAllPOI() {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = (event) => {
      console.error("Failed to load POIs:", event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * POI配列全体をIndexedDBに保存します。（全削除＆全追加として実装）
 * @param {Array<Object>} poiArray 保存するPOIの配列
 */
export async function savePOIArrayToDB(poiArray) {
  if (!db) await openDB();

  // 1. 全削除
  await clearAllPOI();

  // 2. 全追加
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    let successfulSaves = 0;

    poiArray.forEach(poi => {
      // Leafletマーカーインスタンスなど、保存すべきでないプロパティを削除または無視
      const poiToSave = {
        // 'id'はautoIncrementで管理されるため、新規POIの場合は不要。
        // 既存POIの更新・削除のためにidを残しておく。
        ...(poi.id && { id: poi.id }), 
        latlng: poi.latlng,
        timestamp: poi.timestamp instanceof Date ? poi.timestamp.toISOString() : poi.timestamp,
        positioning: poi.positioning,
        number: poi.number,
        description: poi.description
      };
      
      const request = store.put(poiToSave); // 'put'は既存のidがあれば更新、なければ追加
      
      request.onsuccess = (event) => {
          // autoIncrementで生成されたIDを元のPOIオブジェクトに反映（編集・削除のため）
          if (!poi.id) {
            poi.id = event.target.result;
          }
          successfulSaves++;
          if (successfulSaves === poiArray.length) {
              resolve();
          }
      };
      
      request.onerror = (event) => {
          console.error("Failed to save a POI:", event.target.error);
          reject(event.target.error);
      };
    });

    // 配列が空の場合
    if (poiArray.length === 0) resolve();
  });
}

/**
 * IndexedDBから指定されたPOIを削除します。（IDを使用）
 * @param {number} poiId 削除するPOIのID
 */
export async function deletePOIFromDB(poiId) {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // keyPathである'id'を使用して削除
    const request = store.delete(poiId); 

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      console.error("Failed to delete POI:", event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * IndexedDB内の全てのPOIをクリアします。
 */
export async function clearAllPOI() {
  if (!db) await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      console.error("Failed to clear POIs:", event.target.error);
      reject(event.target.error);
    };
  });
}