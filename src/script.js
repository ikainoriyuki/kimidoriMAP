/*!
 * きみどりマップ v1.1.0
 * Copyright Noriyuki IKAI
 * Released under the MIT license
 * https://github.com/ikainoriyuki/webmap/blob/main/LICENSE
 */

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';

import 'leaflet/dist/leaflet.css';
import {
  createIcons,
  Share2, PencilLine, Undo2, Scissors, X, Move, Navigation,
  HardDrive, Map, BoxSelect, List, Tag, Palette, Download,
  FileUp, Settings, Moon, Camera, CloudDownload, Archive, FileCode, Braces,
} from 'lucide';

import { initMap }                  from './map_init.js';
import { initUIControls }           from './ui_controls.js';
import { initPositioning }          from './positioning.js';
import { initPOIManager, getPOIArray, getLineArray, getPolygonArray } from './poi_manager.js';
import { initDataShare }            from './data_share.js';
import { initDataImport } from './data_import.js';
import { initWakeLock }             from './wakelock_manager.js';

import './style.css';

import { registerSW } from 'virtual:pwa-register';

// ============================================================
// サービスワーカー登録
// ============================================================
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('新しいコンテンツが利用可能です。更新しますか？')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('オフライン準備が完了しました。');
  },
});

// ============================================================
// メイン初期化
// ============================================================
async function main() {
  const map = await initMap();

  initUIControls(map);

  const positioning = initPositioning(map);
  initPOIManager(map, positioning);

  initDataShare(getPOIArray, getLineArray, getPolygonArray);
  initDataImport(map);
  initWakeLock(map);

  // 初回表示時に中心座標をUIに反映
  map.fire('moveend');
}

main();
createIcons({
  icons: {
    Share2, PencilLine, Undo2, Scissors, X, Move, Navigation,
    HardDrive, Map, BoxSelect, List, Tag, Palette, Download,
    FileUp, Settings, Moon, Camera, CloudDownload, Archive, FileCode, Braces,
  },
});

// ============================================================
// PWAインストールバナー（Android/Chrome）
// ============================================================
let deferredPrompt;
const pwaBanner    = document.getElementById('pwa-banner');
const installBtn   = document.getElementById('pwa-install-btn');
const closeBannerBtn = document.getElementById('pwa-close-btn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

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

closeBannerBtn.addEventListener('click', () => {
  pwaBanner.style.display = 'none';
  localStorage.setItem('pwa-banner-closed', 'true');
});

// ============================================================
// PWAインストール案内（iOS Safari）
// ============================================================
function showIosInstallPrompt() {
  const isIos        = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true
                    || window.matchMedia('(display-mode: standalone)').matches;

  if (!isIos || isStandalone) return;
  if (localStorage.getItem('ios-pwa-prompt-closed')) return;

  const prompt = document.getElementById('ios-pwa-prompt');
  if (!prompt) return;

  prompt.style.display = 'block';
  document.getElementById('ios-close-btn').addEventListener('click', () => {
    prompt.style.display = 'none';
    localStorage.setItem('ios-pwa-prompt-closed', 'true');
  });
}

window.addEventListener('load', showIosInstallPrompt);