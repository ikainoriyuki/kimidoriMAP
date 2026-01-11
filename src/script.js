/*!
 * きみどりマップ v1.1.0
 *
 * Copyright Noriyuki IKAI
 * Released under the MIT license
 * https://github.com/ikainoriyuki/webmap/blob/main/LICENSE
 *
 * Date: 2025-12-25
 */
import 'leaflet/dist/leaflet.css'; 
import '@fortawesome/fontawesome-free/css/all.min.css';

import { initMap } from './map_init.js';
import { initUIControls } from './ui_controls.js';
import { initPositioning } from './positioning.js';
import { initPOIManager, getPOIArray } from './poi_manager.js';
import { initDataExport } from './data_export.js';
import { initDataImport } from './data_import.js';
import { initWakeLock } from './wakelock_manager.js';

import omnivore from '@mapbox/leaflet-omnivore'
import * as turf from '@turf/turf'; 

import './style.css';

import { registerSW } from 'virtual:pwa-register';

// サービスワーカーの登録と更新処理
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('新しいコンテンツが利用可能です。更新しますか？')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('アプリのオフライン準備が完了しました。');
  },
});

async function main() {
  // map_init.jsがDOMContentLoadedでmapをwindow.mapに公開するのを待つ
  const map = await initMap(); 
  
  // 1. UIの初期化
  initUIControls(map);

  // 2 測位
  const positioning = initPositioning(map);

  // 3. POI管理の初期化
  // uiControlsから現在地の取得関数などを渡すことで依存関係を解決します。
  initPOIManager(map, positioning);

  // 4. データ出力の初期化
  initDataExport(getPOIArray);

  // 5. GeoJSONインポートの初期化
  initDataImport(map);
  
  // 6. スリープロックの初期化
  initWakeLock(map);

  // 最後に、地図の中心情報を手動で一度更新してUIに反映
  map.fire('moveend');
};

main();

// PWAインストールバナー
let deferredPrompt;
const pwaBanner = document.getElementById('pwa-banner');
const installBtn = document.getElementById('pwa-install-btn');
const closeBtn = document.getElementById('pwa-close-btn');

// ブラウザがインストール可能と判断したら呼ばれる
window.addEventListener('beforeinstallprompt', (e) => {
  // 自動で出るバナーを抑止
  e.preventDefault();
  deferredPrompt = e;
  
  // すでに「閉じる」を押していない場合のみ、Wikipedia風バナーを表示
  if (!localStorage.getItem('pwa-banner-closed')) {
    pwaBanner.style.display = 'block';
  }
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  
  if (outcome === 'accepted') {
    pwaBanner.style.display = 'none';
  }
  deferredPrompt = null;
});

// 閉じるボタンを押した時はLocalStorageに保存して、しつこく出さないようにする
closeBtn.addEventListener('click', () => {
  pwaBanner.style.display = 'none';
  localStorage.setItem('pwa-banner-closed', 'true');
});

// iOS判定とインストール案内の表示
function showIosInstallPrompt() {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  // ブラウザの「スタンドアロンモード（インストール済み起動）」でないことを確認
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

  // iOSかつ、まだブラウザで開いている場合のみ表示
  if (isIos && !isStandalone) {
    // すでに閉じた記録がないか確認
    if (!localStorage.getItem('ios-pwa-prompt-closed')) {
      const prompt = document.getElementById('ios-pwa-prompt');
      if (prompt) {
        prompt.style.display = 'block';
            
        // 閉じるボタンのイベント
        document.getElementById('ios-close-btn').addEventListener('click', () => {
          prompt.style.display = 'none';
          localStorage.setItem('ios-pwa-prompt-closed', 'true');
      });
    }
    }
  }
}

// 起動時に実行
window.addEventListener('load', showIosInstallPrompt);