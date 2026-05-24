import * as bootstrap from 'bootstrap';
import { StorageManager } from './storage_manager.js';

// ============================================================
// オフライン保存の進捗UI（Bootstrapモーダル）
// ============================================================
export class OfflineProgressUI {
  constructor(_map) {
    this._progressModal = null;
    this._confirmModal  = null;
  }

  // ---- モーダルインスタンスの遅延初期化 --------------------
  _initModals() {
    if (this._progressModal) return;
    const progressEl = document.getElementById('save-progress-modal');
    const confirmEl  = document.getElementById('save-confirm-modal');
    if (progressEl) this._progressModal = new bootstrap.Modal(progressEl, { backdrop: 'static', keyboard: false });
    if (confirmEl)  this._confirmModal  = new bootstrap.Modal(confirmEl,  { backdrop: 'static' });
  }

  // ---- 確認モーダル（Promise<boolean>） --------------------
  confirm(message) {
    this._initModals();
    const confirmEl = document.getElementById('save-confirm-modal');
    const msgEl     = document.getElementById('save-confirm-message');
    const okBtn     = document.getElementById('save-confirm-ok');
    if (msgEl) msgEl.innerText = message;

    return new Promise(resolve => {
      const onOk = () => {
        confirmEl.removeEventListener('hidden.bs.modal', onHidden);
        this._confirmModal.hide();
        resolve(true);
      };
      const onHidden = () => {
        okBtn.removeEventListener('click', onOk);
        resolve(false);
      };
      okBtn.addEventListener('click', onOk, { once: true });
      confirmEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
      this._confirmModal.show();
    });
  }

  // ---- 進捗モーダルをリセットして表示 ----------------------
  resetProgress(layerName = '') {
    this._initModals();
    const msgEl    = document.getElementById('save-progress-message');
    const barEl    = document.getElementById('save-progress-bar');
    const detailEl = document.getElementById('save-progress-detail');
    const footerEl = document.getElementById('save-progress-footer');

    if (msgEl)    msgEl.textContent = layerName ? `${layerName} を準備中...` : '準備中...';
    if (barEl) {
      barEl.style.width = '0%';
      barEl.setAttribute('aria-valuenow', '0');
      barEl.classList.add('progress-bar-animated', 'progress-bar-striped');
      barEl.classList.remove('bg-success', 'bg-danger');
      barEl.textContent = '';
    }
    if (detailEl) detailEl.textContent = '';
    if (footerEl) footerEl.style.display = 'none';

    this._progressModal?.show();
  }

  // ---- 進捗を更新 ------------------------------------------
  updateProgress(current, total, layerName) {
    this._initModals();
    const pct      = total > 0 ? Math.round((current / total) * 100) : 0;
    const msgEl    = document.getElementById('save-progress-message');
    const barEl    = document.getElementById('save-progress-bar');
    const detailEl = document.getElementById('save-progress-detail');

    if (msgEl)    msgEl.textContent = `${layerName} を保存中...`;
    if (barEl) {
      barEl.classList.add('progress-bar-animated', 'progress-bar-striped');
      barEl.classList.remove('bg-success', 'bg-danger');
      barEl.style.width = `${pct}%`;
      barEl.setAttribute('aria-valuenow', String(pct));
      barEl.textContent = `${pct}%`;
    }
    if (detailEl) detailEl.textContent = `${current} / ${total} 枚`;
  }

  // ---- 完了 ------------------------------------------------
  showComplete(message) {
    this._initModals();
    const msgEl    = document.getElementById('save-progress-message');
    const barEl    = document.getElementById('save-progress-bar');
    const detailEl = document.getElementById('save-progress-detail');
    const footerEl = document.getElementById('save-progress-footer');

    if (msgEl)    msgEl.textContent = message;
    if (barEl) {
      barEl.style.width = '100%';
      barEl.setAttribute('aria-valuenow', '100');
      barEl.textContent = '100%';
      barEl.classList.remove('progress-bar-animated', 'bg-danger');
      barEl.classList.add('bg-success');
    }
    if (detailEl) detailEl.textContent = '';
    if (footerEl) footerEl.style.display = '';
  }

  // ---- エラー ----------------------------------------------
  showError(message) {
    this._initModals();
    const msgEl    = document.getElementById('save-progress-message');
    const barEl    = document.getElementById('save-progress-bar');
    const footerEl = document.getElementById('save-progress-footer');

    if (msgEl) msgEl.innerText = message;
    if (barEl) {
      barEl.classList.remove('progress-bar-animated', 'bg-success');
      barEl.classList.add('bg-danger');
    }
    if (footerEl) footerEl.style.display = '';

    this._progressModal?.show();
  }

  // ---- レイヤーイベントにバインド（saveControl 単体利用時） --
  bindEvents(layer, name) {
    let total = 0, current = 0;

    layer.on('savestart', e => {
      total = e._tilesforSave?.length || 0;
      current = 0;
      this.resetProgress(name);
    });
    layer.on('savetileend', () => {
      current++;
      this.updateProgress(current, total, name);
    });
    layer.on('saveend', () => {
      this.showComplete(`${name} 保存完了 (${total}枚)`);
      StorageManager.updateStorageInfo();
    });
    layer.on('saveerror', e => {
      this.showError(`${name} エラー: ${e.message || '通信失敗'}`);
    });
    layer.on('tilesremoved', () => {
      this.showComplete('タイルを削除しました。');
      StorageManager.updateStorageInfo();
    });
  }
}
