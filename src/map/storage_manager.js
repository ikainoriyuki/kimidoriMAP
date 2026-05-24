// ============================================================
// ストレージユーティリティ
// ============================================================
export const StorageManager = {
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
  },

  async updateStorageInfo() {
    if (!navigator.storage?.estimate) return;
    try {
      const est = await navigator.storage.estimate();
      const { usage = 0, quota = 0 } = est;
      // usageDetails.indexedDB はChrome/Edge対応。非対応時はusage全体にフォールバック
      const idbUsage = est.usageDetails?.indexedDB ?? usage;
      const pct = quota > 0 ? ((idbUsage / quota) * 100).toFixed(1) : 'N/A';
      document.getElementById('storageUsage').innerHTML =
        `使用量: ${this.formatBytes(idbUsage)} <span style="font-size:small;">(${pct}%)</span>`;
      document.getElementById('storageQuota').innerHTML =
        `容量上限: ${this.formatBytes(quota)}`;
    } catch (err) {
      console.error('ストレージ情報取得エラー:', err);
    }
  },

  async requestPersistence() {
    if (!navigator.storage?.persist) return;
    if (!(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  },
};
