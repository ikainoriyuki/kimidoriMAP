// ============================================================
// data_share.js — フォーマット選択ダウンロードモーダル
// ============================================================

import {
  exportToKML,
  exportToKMZ,
  exportToGeoJSON,
  exportToGPX,
} from './data_export.js';
import { downloadAllPhotosAsZip } from './photo_manager.js';

export function initDataShare(getPOIArray, getLineArray, getPolygonArray) {
  document.getElementById('shareBtn').addEventListener('click', () => {
    openDownloadModal(getPOIArray, getLineArray, getPolygonArray);
  });
}

/** 日付グループヘッダーのエクスポートボタンから直接呼び出す用 */
export function openShareModalWithData(poiArray, lineArray, polygonArray, dateLabel) {
  openDownloadModal(() => poiArray, () => lineArray, () => polygonArray, dateLabel);
}

function openDownloadModal(getPOIArray, getLineArray, getPolygonArray, dateLabel) {
  const modalEl = document.getElementById('share-format-modal');

  // Bootstrap Modal JS を使わず直接 CSS 操作でモーダル表示
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop show';
  document.body.appendChild(backdrop);
  modalEl.style.display = 'block';
  modalEl.classList.add('show');
  document.body.classList.add('modal-open');

  const poiArray = getPOIArray();
  const lineArray = getLineArray();
  const polygonArray = getPolygonArray?.() ?? [];
  // dateLabel は "2026/04/29" 形式 → "20260429_locations" に変換
  const fileBase = dateLabel ? dateLabel.replace(/\//g, '') + '_locations' : undefined;

  function closeModal() {
    backdrop.remove();
    modalEl.style.display = 'none';
    modalEl.classList.remove('show');
    document.body.classList.remove('modal-open');
    buttons.forEach(b => b.removeEventListener('click', handleFormatClick));
    closeBtn?.removeEventListener('click', closeModal);
    backdrop.removeEventListener('click', closeModal);
  }

  const buttons = modalEl.querySelectorAll('[data-share-format]');
  const closeBtn = modalEl.querySelector('[data-bs-dismiss="modal"]');

  function handleFormatClick(e) {
    const format = e.currentTarget.dataset.shareFormat;
    closeModal();
    if (format === 'kml')          exportToKML(poiArray, lineArray, polygonArray, fileBase);
    else if (format === 'kmz')     exportToKMZ(poiArray, lineArray, polygonArray, fileBase);
    else if (format === 'geojson') exportToGeoJSON(poiArray, lineArray, polygonArray, fileBase);
    else if (format === 'gpx')     exportToGPX(poiArray, lineArray, fileBase);
    else if (format === 'photos')  downloadAllPhotosAsZip(poiArray, fileBase);
  }

  buttons.forEach(b => b.addEventListener('click', handleFormatClick));
  closeBtn?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
}
