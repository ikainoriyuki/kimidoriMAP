import L from 'leaflet';
import * as turf from '@turf/turf';
import { getLineLatlngs, calcLineLength, formatLength } from './distance_calc.js';
import { Download, ChevronUp, ChevronDown, MapPin, Spline, Pentagon, Pencil, Trash2 } from 'lucide';
import { lucideStr } from '../utils.js';

function formatArea(m2) {
  return `${(m2 / 10000).toFixed(4)} ha`;
}

// ============================================================
// データ一覧（サイドメニュー）
// ============================================================

function closeSidebarThen(callback) {
  const closeBtn = document.querySelector('#sidebarMenu .btn-close');
  if (!closeBtn) { callback(); return; }
  const sidebar = document.getElementById('sidebarMenu');
  sidebar.addEventListener('hidden.bs.offcanvas', callback, { once: true });
  closeBtn.click();
}

/** 日付文字列を取得（YYYY/MM/DD） */
export function toDateStr(timestamp) {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * POI・ラインを作成日でグループ化してサイドメニューに表示する。
 * @param {L.Map} map
 * @param {Array} poiArray
 * @param {Array} lineArray
 * @param {{ deletePOI, removeLineById, editLine }} ops
 */
export function renderDataList(map, poiArray, lineArray, ops) {
  const container = document.getElementById('data-list-container');
  if (!container) return;

  // 展開状態を記憶（再描画後も維持）
  const openDates = new Set(
    [...container.querySelectorAll('.dl-body.show')].map(el => el.dataset.date)
  );
  container.innerHTML = '';

  // --- 全ラインをポリゴン化ボタン（ライン2本以上のとき表示） ---
  if (lineArray.length >= 1 && ops.polygonizeAllLines) {
    const polyBtn = document.createElement('button');
    polyBtn.className   = 'btn btn-sm btn-outline-secondary w-100 mb-2';
    polyBtn.textContent = '全ラインをポリゴン化';
    polyBtn.addEventListener('click', () => ops.polygonizeAllLines(lineArray));
    container.appendChild(polyBtn);
  }

  // --- グループ化 ---
  const groups = {};

  poiArray.forEach(poi => {
    const d = toDateStr(poi.timestamp);
    (groups[d] = groups[d] || []).push({ type: 'poi', poi });
  });

  lineArray.forEach((line, idx) => {
    const firstPoi = poiArray.find(p => p.id === line.poiIds[0]);
    const d = firstPoi ? toDateStr(firstPoi.timestamp) : '日付不明';
    (groups[d] = groups[d] || []).push({ type: 'line', line, idx });
  });

  const polygons = ops.getPolygons?.() ?? [];
  polygons.forEach((rec, idx) => {
    const d = rec.timestamp ? toDateStr(new Date(rec.timestamp)) : '日付不明';
    (groups[d] = groups[d] || []).push({ type: 'polygon', rec, idx });
  });

  if (Object.keys(groups).length === 0) {
    const msg = document.createElement('p');
    msg.className   = 'small text-secondary p-3 mb-0';
    msg.textContent = 'データがありません。';
    container.appendChild(msg);
    return;
  }

  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  sortedDates.forEach((dateStr) => {
    const groupId = `dl-group-${dateStr.replace(/\//g, '')}`;
    const isOpen  = openDates.has(dateStr);

    // ─ ヘッダー ─
    const header = document.createElement('div');
    header.className = 'data-list-date-header';
    header.setAttribute('data-bs-toggle', 'collapse');
    header.setAttribute('data-bs-target', `#${groupId}`);
    header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    header.innerHTML =
      `<span>${dateStr}（${groups[dateStr].length}件）</span>` +
      `<div class="dl-header-right">` +
        `<button class="dl-date-export-btn" title="この日のデータを保存">${lucideStr(Download)}</button>` +
        `<span class="dl-chevron">${isOpen ? lucideStr(ChevronUp) : lucideStr(ChevronDown)}</span>` +
      `</div>`;
    header.querySelector('.dl-date-export-btn').addEventListener('click', e => {
      e.stopPropagation();
      ops.exportByDate?.(dateStr);
    });
    header.addEventListener('click', () => {
      const body = document.getElementById(groupId);
      const isNowOpen = body?.classList.contains('show');
      header.querySelector('.dl-chevron').innerHTML =
        isNowOpen ? lucideStr(ChevronDown) : lucideStr(ChevronUp);
    });
    container.appendChild(header);

    // ─ ボディ ─
    const body = document.createElement('div');
    body.id           = groupId;
    body.className    = `dl-body collapse${isOpen ? ' show' : ''}`;
    body.dataset.date = dateStr;

    groups[dateStr].forEach(entry => {
      const row = document.createElement('div');
      row.className = 'data-list-item';

      if (entry.type === 'poi') {
        const { poi } = entry;
        const label = (`${poi.stake_type || ''}${poi.number ?? ''}`) || '(無名)';

        row.innerHTML =
          `<span class="data-list-item__icon" style="color:#004926">${lucideStr(MapPin, 16)}</span>` +
          `<div class="data-list-item__text">` +
            `<div class="data-list-item__label">${label}</div>` +
            `${poi.description ? `<div class="data-list-item__sub">${poi.description}</div>` : ''}` +
          `</div>` +
          `<div class="data-list-item__actions">` +
            `<button class="dl-del-btn" title="削除">${lucideStr(Trash2, 15)}</button>` +
          `</div>`;

        row.querySelector('.data-list-item__text').addEventListener('click', () => {
          map.setView(poi.latlng, Math.max(map.getZoom(), 17));
          poi.markerInstance?.openPopup();
          document.querySelector('#sidebarMenu .btn-close')?.click();
        });
        row.querySelector('.data-list-item__icon').addEventListener('click', () => {
          map.setView(poi.latlng, Math.max(map.getZoom(), 17));
          poi.markerInstance?.openPopup();
          document.querySelector('#sidebarMenu .btn-close')?.click();
        });
        row.querySelector('.dl-del-btn').addEventListener('click', e => {
          e.stopPropagation();
          if (confirm(`「${label}」を削除しますか？`)) {
            ops.deletePOI(map, poi, poi.markerInstance);
          }
        });

      } else if (entry.type === 'line') {
        const { line, idx } = entry;
        const pts = line.poiIds.map(id => poiArray.find(p => p.id === id)).filter(Boolean);
        const lineLabel = pts.length >= 2
          ? `${pts[0].stake_type||''}${pts[0].number} → ${pts.at(-1).stake_type||''}${pts.at(-1).number}`
          : `ライン ${idx + 1}`;

        const lineLatlngs = getLineLatlngs(line, poiArray);
        const lineLength  = formatLength(calcLineLength(lineLatlngs));
        const vertexCount = lineLatlngs.length;
        const lineSub = line.description
          ? `${vertexCount}点 / 延長: ${lineLength} / ${line.description}`
          : `${vertexCount}点 / 延長: ${lineLength}`;

        row.innerHTML =
          `<span class="data-list-item__icon" style="color:#004926">${lucideStr(Spline, 16)}</span>` +
          `<div class="data-list-item__text">` +
            `<div class="data-list-item__label">${line.name || lineLabel}</div>` +
            `<div class="data-list-item__sub">${lineSub}</div>` +
          `</div>` +
          `<div class="data-list-item__actions">` +
            `<button class="dl-edit-btn" title="編集">${lucideStr(Pencil)}</button>` +
            `<button class="dl-del-btn" title="削除">${lucideStr(Trash2, 15)}</button>` +
          `</div>`;

        row.querySelector('.data-list-item__text').addEventListener('click', () => {
          const latlngs = getLineLatlngs(line, poiArray);
          if (latlngs.length >= 2) map.fitBounds(L.polyline(latlngs).getBounds(), { padding: [40,40] });
          else if (latlngs[0]) map.setView(latlngs[0], Math.max(map.getZoom(), 17));
          document.querySelector('#sidebarMenu .btn-close')?.click();
        });
        row.querySelector('.data-list-item__icon').addEventListener('click', () => {
          const latlngs = getLineLatlngs(line, poiArray);
          if (latlngs.length >= 2) map.fitBounds(L.polyline(latlngs).getBounds(), { padding: [40,40] });
          else if (latlngs[0]) map.setView(latlngs[0], Math.max(map.getZoom(), 17));
          document.querySelector('#sidebarMenu .btn-close')?.click();
        });
        row.querySelector('.dl-edit-btn').addEventListener('click', e => {
          e.stopPropagation();
          closeSidebarThen(() => ops.editLine(map, line));
        });
        row.querySelector('.dl-del-btn').addEventListener('click', e => {
          e.stopPropagation();
          if (confirm(`「${line.name || lineLabel}」を削除しますか？`)) {
            ops.removeLineById(map, line.id).then(() => renderDataList(map, poiArray, lineArray, ops));
          }
        });

      } else if (entry.type === 'polygon') {
        const { rec, idx } = entry;
        const label   = rec.name || `ポリゴン ${idx + 1}`;
        const areaSub = rec.feature ? formatArea(turf.area(rec.feature)) : '';
        const subText = [areaSub ? `面積: ${areaSub}` : '', rec.description || ''].filter(Boolean).join(' / ');

        row.innerHTML =
          `<span class="data-list-item__icon" style="color:#004926">${lucideStr(Pentagon, 16)}</span>` +
          `<div class="data-list-item__text">` +
            `<div class="data-list-item__label">${label}</div>` +
            `${subText ? `<div class="data-list-item__sub">${subText}</div>` : ''}` +
          `</div>` +
          `<div class="data-list-item__actions">` +
            `<button class="dl-edit-btn" title="編集">${lucideStr(Pencil)}</button>` +
            `<button class="dl-del-btn" title="削除">${lucideStr(Trash2, 15)}</button>` +
          `</div>`;

        const jumpToPolygon = () => {
          if (rec.layer) map.fitBounds(rec.layer.getBounds(), { padding: [40, 40] });
          document.querySelector('#sidebarMenu .btn-close')?.click();
        };
        row.querySelector('.data-list-item__text').addEventListener('click', jumpToPolygon);
        row.querySelector('.data-list-item__icon').addEventListener('click', jumpToPolygon);
        row.querySelector('.dl-edit-btn').addEventListener('click', e => {
          e.stopPropagation();
          closeSidebarThen(() => ops.editPolygon(rec));
        });
        row.querySelector('.dl-del-btn').addEventListener('click', e => {
          e.stopPropagation();
          if (confirm(`「${label}」を削除しますか？`)) ops.deletePolygon(rec.id);
        });
      }

      body.appendChild(row);
    });

    container.appendChild(body);
  });
}
