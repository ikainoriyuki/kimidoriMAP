// ============================================================
// プロパティキー抽出ユーティリティ
// ============================================================
export function extractPropertyKeys(data) {
  const keys = new Set();
  data.features.forEach(f => {
    if (f.properties) Object.keys(f.properties).filter(k => k !== '_fid').forEach(k => keys.add(k));
  });
  return [...keys];
}

// ============================================================
// 登録データへのコピー ダイアログ
// ============================================================
export function openCopyDialog(entry) {
  return new Promise(resolve => {
    const keys = extractPropertyKeys(entry.geojsonData);

    const pointCount = entry.geojsonData.features.filter(f =>
      f.geometry && ['Point', 'MultiPoint'].includes(f.geometry.type)).length;
    const skipCount = entry.geojsonData.features.filter(f =>
      f.geometry && !['Point', 'MultiPoint'].includes(f.geometry.type)).length;

    const noneOpt = `<option value="">（なし）</option>`;
    const autoOpt = `<option value="">自動採番</option>`;
    const keyOpts = keys.map(k => `<option value="${escAttr(k)}">${escText(k)}</option>`).join('');

    const overlay = document.createElement('div');
    overlay.className = 'poi-modal-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="poi-modal-dialog">
        <div class="poi-modal-header">
          <h4 class="poi-modal-title">登録データにコピー</h4>
        </div>
        <div class="poi-modal-body">
          <p style="font-size:0.85em;color:#555;margin-bottom:12px">
            「${escText(entry.fileName)}」からコピーします（ポイントのみ）。<br>
            ポイント: ${pointCount}件
            ${skipCount > 0 ? `<br><span style="color:#888">（ライン・ポリゴン ${skipCount}件はスキップ）</span>` : ''}
          </p>
          <label class="poi-modal-label">種別（杭種）</label>
          <input type="text" id="_copy-stake-type" class="poi-modal-input" placeholder="例: 杭">
          <label class="poi-modal-label" style="margin-top:8px">番号プロパティ</label>
          <select id="_copy-number-prop" class="poi-modal-input">
            ${autoOpt}${keyOpts}
          </select>
          <label class="poi-modal-label" style="margin-top:8px">説明プロパティ</label>
          <select id="_copy-desc-prop" class="poi-modal-input">
            ${noneOpt}${keyOpts}
          </select>
        </div>
        <div class="poi-modal-actions">
          <button id="_copy-cancel-btn" class="poi-modal-btn poi-modal-btn--cancel">キャンセル</button>
          <button id="_copy-ok-btn"     class="poi-modal-btn poi-modal-btn--save">コピー実行</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const cleanup = () => document.body.removeChild(overlay);

    overlay.querySelector('#_copy-cancel-btn').addEventListener('click', () => {
      cleanup(); resolve(null);
    }, { once: true });

    overlay.querySelector('#_copy-ok-btn').addEventListener('click', () => {
      const fieldMap = {
        stakeType:  overlay.querySelector('#_copy-stake-type').value.trim(),
        numberProp: overlay.querySelector('#_copy-number-prop').value || null,
        descProp:   overlay.querySelector('#_copy-desc-prop').value   || null,
      };
      cleanup(); resolve(fieldMap);
    }, { once: true });
  });
}

function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
function escText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
