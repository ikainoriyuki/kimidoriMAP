import { loadAllPOI, savePOIArrayToDB, deletePOIFromDB, clearAllPOI as clearAllPOIFromDB } from './indexedDB_poi_storage.js';
import '@fortawesome/fontawesome-free/css/all.min.css';

const POI_STORAGE_KEY = 'poiArray';
let poiArray = [];

export function initPOIManager(map, positioning) {
  loadPOIArray(map);
  
  document.getElementById('saveBtn').onclick = () => saveCurrentLocation(map, positioning);
  document.getElementById('saveCenterBtn').onclick = () => saveMapCenterLocation(map, positioning);
  document.getElementById('allClearBtn').addEventListener('click', () => clearLocalStorage(map));
}

//--- POI配列をIndexedDBから読み込み ---

async function loadPOIArray(map) {
  try {
    const savedPOIArray = await loadAllPOI(); 
    
    poiArray = savedPOIArray.map(poi => {
      // DBから読み込まれたデータを処理
      if (typeof poi.timestamp === 'string') {
          poi.timestamp = new Date(poi.timestamp);
      }
      // 'id'はIndexedDBのkeyPathとして必須なので、ここで追加/保持する
      poi.id = poi.id; 
      poi.stake_type = typeof poi.stake_type === 'string' ? poi.stake_type : "";
      poi.number = typeof poi.number === 'number' && !isNaN(poi.number) ? poi.number : 0;
      poi.description = typeof poi.description === 'string' ? poi.description : "";
      
      addMarker(map, poi);
      return poi;
    });
    console.log(`Loaded ${poiArray.length} POIs from IndexedDB.`);
  } catch (error) {
    console.error("Failed to load POI array from IndexedDB.", error);
    // エラー時は空の配列を初期化
    poiArray = [];
  }
}

// POI配列をIndexedDBに保存
async function savePOIArray() {
  // マーカーインスタンス（LeafletのLayerオブジェクト）は保存しないように注意
  // IndexedDBのストレージモジュールで処理するため、ここでは単に全POIを渡す
  try {
    await savePOIArrayToDB(poiArray);
    console.log("POI array successfully saved to IndexedDB.");
  } catch (error) {
    console.error("Failed to save POI array to IndexedDB.", error);
  }
}

// POIの杭種を前回の値から取得
function getPreviousPOIStakeType() {
  if (poiArray.length === 0) return "";
  const lastPOI = poiArray[poiArray.length - 1]; 
  return typeof lastPOI.stake_type === 'string' ? lastPOI.stake_type : "";
}

// POIの番号を連番に（最後の番号を取得）
function getPreviousPOINumber() {
  if (poiArray.length === 0) return 0;
  const lastPOI = poiArray[poiArray.length - 1]; 
  return typeof lastPOI.number === 'number' ? lastPOI.number : 0;
}

// ------------------------------
// POIのマーカー作成とポップアップ
// ------------------------------
// マーカーSVG
const customSvgHtml = `
<svg width="40" height="40" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="20" cy="20" r="20" stroke="white" stroke-width="4" fill="#004926ff" />
</svg>
`;

// Leaflet用のアイコンオブジェクトを作成
const poiIcon = L.divIcon({
  html: customSvgHtml,
  className: 'custom-poi-icon', // CSSで調整用
  iconSize: [40, 40],           // アイコンのサイズ [横, 縦]
  iconAnchor: [10, 10],         // アイコンの中心点（この例では真ん中）
  popupAnchor: [0, -10]         // ポップアップが出る位置
});

// --- POIマーカーを地図に追加 ---
function addMarker(map, poi, showPopup = false) {
  let marker = L.marker(poi.latlng,{
    icon: poiIcon,
  }).addTo(map)
    .bindPopup(createPopupContent(poi));

  poi.markerInstance = marker; 

  function attachListeners() {
    if (document.getElementById('edit-btn')) {
      document.getElementById('edit-btn').addEventListener('click', function() {
          editPOI(poi, poi.markerInstance);
      });
    }

    if (document.getElementById('delete-btn')) {
      document.getElementById('delete-btn').addEventListener('click', function() {
        if (confirm("このマーカーを本当に削除しますか？")) {
          deletePOI(map, poi, poi.markerInstance);
        }
      });
    }
  }

  if (showPopup) {
    marker.openPopup();
    setTimeout(attachListeners, 100); 
  }
  marker.on('popupopen', attachListeners);
}

// --- マーカーのポップアップの内容 ---

function createPopupContent(poi) {
  const poiStake = poi.stake_type || "";
  const poiNumber = poi.number || 0;
  const poiDescription = poi.description || ""; 

  return `<div class="popup-content">時間: ${poi.timestamp.toLocaleDateString()}_${poi.timestamp.toLocaleTimeString()}<br>測位: ${poi.positioning}<br>番号: ${poiStake}${poiNumber}<br>属性: ${poiDescription}</div>` +
    `<br><button id='edit-btn' class='edit-button'>編集</button> <button id='delete-btn' class='delete-button'>削除</button>`;
}

// --- モーダル（POI登録/編集/削除） ---

async function openPOIModal(title, defaultStake, defaultNumber, defaultDescription) {
  return new Promise((resolve) => {
    const modal = document.getElementById('poi-modal');
    if (!modal) {
        console.error("POIモーダル要素 (#poi-modal) が見つかりません。");
        return resolve(null);
    }
    
    const stakeInput = document.getElementById('poi-stake-type');
    const numberInput = document.getElementById('poi-number');
    const descriptionInput = document.getElementById('poi-description');
    const saveBtn = document.getElementById('modal-save');
    const cancelBtn = document.getElementById('modal-cancel');
    const modalTitle = document.getElementById('modal-title');

    modalTitle.textContent = title;
    stakeInput.value = defaultStake || '';
    numberInput.value = defaultNumber !== undefined && defaultNumber !== null ? String(defaultNumber) : '';
    descriptionInput.value = defaultDescription || '';
    
    // 既存のイベントリスナーを削除（複数回呼び出し対策）
    const newSaveBtn = saveBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    
    const cleanup = () => {
      modal.style.display = 'none';
    };
    
    // 保存ボタンの処理
    newSaveBtn.addEventListener('click', function saveHandler() {
      const newStake = stakeInput.value.trim();
      const newNumber = parseInt(numberInput.value, 10);
      const newDescription = descriptionInput.value.trim();

      if (isNaN(newNumber) || newNumber < 0) {
        alert("有効な番号（0以上の数値）を入力してください。");
        return;
      }

      cleanup();
      resolve({ stake_type: newStake, number: newNumber, description: newDescription });
    }, { once: true }); // 一度だけ実行

    // キャンセルボタンの処理
    newCancelBtn.addEventListener('click', function cancelHandler() {
      cleanup();
      resolve(null);
    }, { once: true }); // 一度だけ実行

    modal.style.display = 'block';
  });
}

// --- POIの保存、編集、削除、クリア（現在地） ---
async function saveCurrentLocation(map, uiControls) {
  const marker = uiControls.getCurrentLocationMarker();
  if (!marker) {
    alert("現在地が取得されていません。まずは現在地を表示してください。");
    return;
  }
  const markerLatLng = marker.getLatLng();
  const suggestedStakeType = getPreviousPOIStakeType();
  const suggestedNumber = getPreviousPOINumber() + 1;
  const result = await openPOIModal("現在地を登録", suggestedStakeType, suggestedNumber, ""); 
  
  if (result) {
    let newPOI = {
      latlng: markerLatLng, timestamp: new Date(), positioning: "Positioning-based",
      number: result.number, description: result.description, stake_type: result.stake_type
    };
    poiArray.push(newPOI);
    addMarker(map, newPOI, true);
    await savePOIArray();
  }
}

async function saveMapCenterLocation(map, uiControls) { 
  const center = map.getCenter();
  const suggestedStakeType = getPreviousPOIStakeType();
  const suggestedNumber = getPreviousPOINumber() + 1;
  const result = await openPOIModal("画面中央を登録", suggestedStakeType, suggestedNumber, "");
  
  if (result) {
    let newPOI = {
      latlng: center, timestamp: new Date(), positioning: "map-center",
      number: result.number, description: result.description, stake_type: result.stake_type
    };
    poiArray.push(newPOI);
    addMarker(map, newPOI, true);
    await savePOIArray();
  }
}

async function editPOI(poi, marker) {
  const result = await openPOIModal("地点を編集", poi.stake_type, poi.number, poi.description);
  
  if (result) {
    poi.stake_type = result.stake_type;
    poi.number = result.number;
    poi.description = result.description;
    
    marker.setPopupContent(createPopupContent(poi));
    if (marker.isPopupOpen()) {
        marker.openPopup(); 
    }
    await savePOIArray();
  }
}

async function deletePOI(map, poi, marker) {
  let index = poiArray.indexOf(poi);
  if (index > -1) {
    // 1. IndexedDBから削除 (POIに保存されているidを使用)
    if (poi.id) {
        await deletePOIFromDB(poi.id);
    } else {
        console.warn("POI ID not found for deletion, relying on array removal and full save.");
    }

    // 2. 配列から削除
    poiArray.splice(index, 1);
    
    // 3. マーカーを地図から削除
    map.removeLayer(marker);
    
    // 4. 残りの配列をIndexedDBに保存 (これにより、idがないPOIがあっても整合性を保てる)
    await savePOIArray();
  }
}

async function clearLocalStorage(map) { 
  if (confirm("すべてのデータを削除しますか？")) {
    
    // 1. IndexedDBをクリア
    await clearAllPOIFromDB(); // ★ IndexedDBのクリア関数を呼び出す
    
    // 2. Local Storageの古いキーは削除（もし残っていた場合）
    localStorage.removeItem(POI_STORAGE_KEY); 
    
    // 3. マーカーと配列をクリア
    poiArray.forEach(poi => {
        if (poi.markerInstance) {
            map.removeLayer(poi.markerInstance);
        }
    });
    poiArray = [];
    alert("データが削除されました。");
  }
}

export function getPOIArray() {
  return poiArray;
}