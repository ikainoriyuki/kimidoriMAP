// ============================================================
// wakelock_manager.js — 地図操作中のスリープ防止
//
// 地図を動かしている間はWakeLockを有効化し、
// 操作が止まってから設定時間後に自動解除する（0=無制限）。
// ============================================================

const STORAGE_KEY = 'wakeLockDelayMin';
const DEFAULT_MIN = 3;

/** localStorage から遅延ミリ秒を取得。0 は「無制限（自動解除しない）」。 */
function getSleepDelayMs() {
  const val = parseInt(localStorage.getItem(STORAGE_KEY) ?? String(DEFAULT_MIN), 10);
  return Number.isFinite(val) && val > 0 ? val * 60 * 1000 : 0;
}

let sentinel   = null; // WakeLockSentinel
let sleepTimer = null;

async function enableWakeLock() {
  if (!('wakeLock' in navigator) || sentinel) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch (err) {
    console.error('WakeLock有効化エラー:', err.name);
  }
}

function scheduleDisableWakeLock() {
  if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
  const delay = getSleepDelayMs();
  if (delay === 0) return; // 無制限：自動解除しない
  sleepTimer = setTimeout(async () => {
    if (sentinel) { await sentinel.release(); sentinel = null; }
    sleepTimer = null;
  }, delay);
}

/** offcanvas 内のセレクトボックスと localStorage を同期する */
function initSettingsUI() {
  const select = document.getElementById('wakeLockDelaySelect');
  if (!select) return;

  // 保存済みの値を反映
  const saved = localStorage.getItem(STORAGE_KEY) ?? String(DEFAULT_MIN);
  select.value = saved;

  select.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEY, select.value);
    // 現在タイマーが動いていれば新しい値で再スケジュール
    if (sleepTimer) scheduleDisableWakeLock();
  });
}

export function initWakeLock(map) {
  initSettingsUI();
  map.on('movestart', () => {
    if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
    enableWakeLock();
  });
  map.on('moveend', scheduleDisableWakeLock);
}
