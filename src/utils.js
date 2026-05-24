// ============================================================
// utils.js — 共通ユーティリティ
// ============================================================
import { createElement } from 'lucide';

export function lucideStr(icon, size = 16) {
  return createElement(icon, { width: size, height: size }).outerHTML;
}

/**
 * 指定座標の標高を地理院APIから取得し、要素に表示する。
 * @param {number}      lat      緯度
 * @param {number}      lng      経度
 * @param {HTMLElement} element  表示先要素
 * @param {Function}    callback 取得後のコールバック (elevation: number | null) => void
 */
export function showToast(message, duration = 3000) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.style.cssText = [
      'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
      'background:rgba(0,0,0,0.75)', 'color:#fff', 'padding:10px 18px',
      'border-radius:6px', 'font-size:14px', 'z-index:9999',
      'pointer-events:none', 'white-space:nowrap', 'display:none'
    ].join(';');
    document.body.appendChild(el);
  }
  clearTimeout(el._timer);
  el.textContent = message;
  el.style.display = 'block';
  el._timer = setTimeout(() => { el.style.display = 'none'; }, duration);
}

export function updateElevation(lat, lng, element, callback) {
  const url = `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lng}&lat=${lat}`;

  fetch(url)
    .then(r => r.json())
    .then(data => {
      const elev = data.elevation;
      if (elev !== undefined) {
        element.textContent = elev.toFixed(2);
        callback?.(elev);
      } else {
        element.textContent = 'N/A';
        callback?.(null);
      }
    })
    .catch(err => {
      console.error('標高取得エラー:', err);
      element.textContent = 'Error';
      callback?.(null);
    });
}
