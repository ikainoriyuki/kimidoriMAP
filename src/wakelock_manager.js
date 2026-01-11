// wakelock_manager.js

let wakeLockSentinel = null;
let sleepTimer;
const SLEEP_DELAY_MS = 180000; // 3分

async function enableWakeLock() {
  if (!('wakeLock' in navigator)) { return; }
  if (wakeLockSentinel) { return; }
      
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
  } catch (err) {
    console.error(`WakeLock APIの有効化に失敗しました: ${err.name}`);
  }
}

function disableWakeLockDelayed() {
  if (sleepTimer) {
    clearTimeout(sleepTimer);
  }

  sleepTimer = setTimeout(async () => {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
    sleepTimer = null;
  }, SLEEP_DELAY_MS);
}

export function initWakeLock(map) {
  map.on('movestart', () => {
    if (sleepTimer) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
    }
    enableWakeLock();
  });
    
  map.on('moveend', disableWakeLockDelayed);
}