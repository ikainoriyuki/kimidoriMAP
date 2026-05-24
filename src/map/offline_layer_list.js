import { getStorageInfo, removeTile } from 'leaflet.offline';
import { StorageManager } from './storage_manager.js';
import { Trash2 } from 'lucide';
import { lucideStr } from '../utils.js';

// ============================================================
// オフラインマップ削除UI
// ============================================================
export async function setupOfflineLayerList(map, baseLayers, groupLayers) {
  const container = document.getElementById('offline-layer-list');
  if (!container) return;

  const allLayers = [];

  Object.entries(baseLayers).forEach(([name, layer]) => {
    if (layer._url) allLayers.push({ name, url: layer._url });
  });
  groupLayers.forEach(({ name: groupName, tileLayers }) => {
    tileLayers.forEach(({ name, tileLayer }) => {
      if (tileLayer._url) allLayers.push({ name, url: tileLayer._url });
    });
  });

  let rendering = false;
  async function renderList() {
    if (rendering) return;
    rendering = true;
    container.innerHTML = '';

    for (const { name, url } of allLayers) {
      let count = 0;
      try {
        const tiles = await getStorageInfo(url);
        count = tiles ? tiles.length : 0;
      } catch (_) {}

      if (count === 0) continue;

      const row = document.createElement('div');
      row.className = 'offline-layer-row';

      const nameEl = document.createElement('span');
      nameEl.className   = 'offline-layer-row__name';
      nameEl.textContent = name;
      nameEl.title       = name;
      nameEl.style.fontSize = '12px';

      const countEl = document.createElement('span');
      countEl.className   = 'offline-layer-row__count';
      countEl.textContent = `${count}枚`;

      const delBtn = document.createElement('button');
      delBtn.className = 'offline-layer-row__delete';
      delBtn.innerHTML = lucideStr(Trash2);
      delBtn.title     = `「${name}」の保存タイルを削除`;

      delBtn.addEventListener('click', async () => {
        if (!confirm(`「${name}」の保存タイル ${count}枚 を削除しますか？`)) return;
        delBtn.disabled = true;
        try {
          const tiles = await getStorageInfo(url);
          await Promise.all(tiles.map(t => removeTile(t.key)));
          StorageManager.updateStorageInfo();
          await renderList();
        } catch (e) {
          alert('削除に失敗しました。');
          console.error(e);
          delBtn.disabled = false;
        }
      });

      row.append(nameEl, countEl, delBtn);
      container.appendChild(row);
    }

    if (container.children.length === 0) {
      const msg = document.createElement('p');
      msg.className   = 'small text-secondary mb-0';
      msg.textContent = '保存済みのタイルはありません。';
      container.appendChild(msg);
    }
    rendering = false;
  }

  document.getElementById('collapseOffline')
    ?.addEventListener('shown.bs.collapse', renderList);
}
