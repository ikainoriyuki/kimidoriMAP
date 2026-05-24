import L from 'leaflet';
import 'leaflet.offline';
import cloudDownloadUrl from './cloud-download.svg';
import { CS_MAPS_CONFIG, FOREST_TYPE_MAPS_CONFIG } from './map_config.js';
import { StorageManager } from './map/storage_manager.js';
import { OfflineProgressUI } from './map/offline_progress_ui.js';
import { createGsiVectorOverlay, createGsiPlaceNameOverlay } from './map/gsi_vector_overlay.js';
import { LayerFactory } from './map/layer_factory.js';
import { setupBoundsVisibility } from './map/bounds_visibility.js';
import { setupStorageAreaOverlay } from './map/storage_area_overlay.js';
import { setupOfflineLayerList } from './map/offline_layer_list.js';

// ============================================================
// 定数
// ============================================================
const MAP_STATE_KEY  = 'mapState';
const DEFAULT_CENTER = [35.6809591, 139.7673068];
const DEFAULT_ZOOM   = 16;

// ============================================================
// 地図の位置状態の保存・復元
// ============================================================
const MapStateManager = {
  save(map) {
    const { lat, lng } = map.getCenter();
    localStorage.setItem(MAP_STATE_KEY, JSON.stringify({ lat, lng, zoom: map.getZoom() }));
  },
  load() {
    try { return JSON.parse(localStorage.getItem(MAP_STATE_KEY)); } catch { return null; }
  },
};

// ============================================================
// メイン初期化
// ============================================================
export async function initMap() {
  // 1. 地図生成（前回の位置を復元）
  const saved = MapStateManager.load();
  const map = L.map('map', {
    center: saved ? [saved.lat, saved.lng] : DEFAULT_CENTER,
    zoom:   saved ? saved.zoom            : DEFAULT_ZOOM,
    maxZoom: 23,
  });

  // 2. オフライン進捗UI
  const ui = new OfflineProgressUI(map);

  // 3. ベースレイヤー
  const baseLayers = LayerFactory.createBaseLayers();

  const defaultLayer = baseLayers['地理院地図'];
  map.addLayer(defaultLayer);

  // 4. レイヤーコントロール
  const layerControl = L.control.layers(baseLayers, []).addTo(map);

  // 5. CS・林相レイヤーをカテゴリ別に L.layerGroup にまとめる
  const csGroup   = LayerFactory.createGroupLayer(CS_MAPS_CONFIG,          ui, '微地形図');
  const ftGroup   = LayerFactory.createGroupLayer(FOREST_TYPE_MAPS_CONFIG, ui, '林相識別図');
  const groupLayers = [csGroup, ftGroup];

  groupLayers.forEach(({ group, name }) => layerControl.addBaseLayer(group, name));

  const updateBoundsVisibility = setupBoundsVisibility(map, groupLayers);

  // 6. タイル保存コントロール
  let activeBaseTileLayer = defaultLayer;

  const saveControl = L.control.savetiles(defaultLayer, {
    zoomlevels: [16, 17, 18],
    confirm: async (layer, cb) => {
      const count = layer._tilesforSave?.length || 0;
      if (count > 2500) {
        ui.showError(`枚数が多すぎます(${count}枚)。範囲を狭めてください。`);
        return;
      }
      if (await ui.confirm(`保存しますか？ (${count}枚)`)) cb();
    },
    confirmRemoval: async (_layer, cb) => {
      if (await ui.confirm('保存済みのタイルを削除しますか？')) cb();
    },
  }).addTo(map);
  saveControl.getContainer().style.display = 'none';

  map.on('baselayerchange', e => {
    if (e.layer._url) {
      activeBaseTileLayer = e.layer;
      saveControl.setLayer(e.layer);
    } else {
      // グループレイヤー（微地形図・林相識別図）に切り替えた場合は
      // 背景タイルレイヤーを保存対象から外す
      activeBaseTileLayer = null;
    }
    updateBoundsVisibility();
  });

  // 表示中の全 tileLayer.offline を順次保存するボタン
  const SaveAllControl = L.Control.extend({
    onAdd(map) {
      const btn = L.DomUtil.create('a', 'leaflet-bar-part');
      btn.href  = '#';
      btn.title = '表示中の全レイヤーを保存';

      const icon = L.DomUtil.create('img', '', btn);
      icon.src    = cloudDownloadUrl;
      icon.style.width  = '20px';
      icon.style.height = '20px';

      btn.style.display        = 'flex';
      btn.style.alignItems     = 'center';
      btn.style.justifyContent = 'center';
      btn.style.width          = '30px';
      btn.style.height         = '30px';
      btn.style.backgroundColor = '#fff';

      L.DomEvent.on(btn, 'click', L.DomEvent.stop).on(btn, 'click', async () => {
        const targets = [];
        // 背景タイルレイヤーが選択中の場合のみ対象に追加
        if (activeBaseTileLayer) targets.push({ layer: activeBaseTileLayer, name: '背景地図' });

        groupLayers.forEach(({ group, tileLayers }) => {
          if (!map.hasLayer(group)) return;
          tileLayers.forEach(entry => {
            if (entry.inGroup) targets.push({ layer: entry.tileLayer, name: entry.name });
          });
        });

        if (targets.length === 0) {
          await ui.confirm('保存対象のレイヤーがありません。');
          return;
        }

        // 各レイヤーのタイル数を事前計算（確認ダイアログ表示前）
        const tileCounts = targets.map(({ layer, name }) => {
          saveControl.setLayer(layer);
          return { name, count: saveControl._calculateTiles().length };
        });
        if (activeBaseTileLayer) saveControl.setLayer(activeBaseTileLayer);

        const totalCount = tileCounts.reduce((sum, t) => sum + t.count, 0);
        const countLines = tileCounts.map(({ name, count }) => `・${name}: ${count}枚`).join('\n');

        if (totalCount > 2500) {
          ui.showError(
            `サーバー負荷軽減のため、範囲を狭くしてから再度保存してください（推奨2,500枚以下；現状 ${totalCount} 枚）。\n\n${countLines}`
          );
          return;
        }

        const ok = await ui.confirm(
          `表示範囲の地図を保存します。\n合計: ${totalCount}枚\n\n${countLines}`
        );
        if (!ok) return;

        // ネットワークエラー・IndexedDB書き込みエラーで loader チェーンが途中終了するのを防ぐため
        // _loadTile/_saveTile をパッチし、エラー時もカウントを維持してチェーンを継続する
        const origConfirm  = saveControl.options.confirm;
        const origLoadTile = saveControl._loadTile;
        const origSaveTile = saveControl._saveTile;
        saveControl._loadTile = async function(tile) {
          try {
            return await Promise.race([
              origLoadTile.call(saveControl, tile),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000)),
            ]);
          } catch {
            saveControl.status.lengthLoaded += 1;
            saveControl._baseLayer.fire('loadtileend', saveControl.status);
            if (saveControl.status.lengthLoaded === saveControl.status.lengthToBeSaved) {
              saveControl._baseLayer.fire('loadend', saveControl.status);
            }
            return undefined;
          }
        };
        saveControl._saveTile = async function(tile, blob) {
          try {
            return await origSaveTile.call(saveControl, tile, blob);
          } catch {
            saveControl.status.lengthSaved += 1;
            saveControl._baseLayer.fire('savetileend', saveControl.status);
            if (saveControl.status.lengthSaved === saveControl.status.lengthToBeSaved) {
              saveControl._baseLayer.fire('saveend', saveControl.status);
            }
          }
        };

        let aborted = false;
        for (const { layer, name } of targets) {
          if (aborted) break;
          saveControl.setLayer(layer);
          ui.resetProgress(name);

          await new Promise((resolve) => {
            let total = -1;
            let loadCount = 0;
            let resolved = false;

            const done = () => {
              if (resolved) return;
              resolved = true;
              layer.off('savestart', onSaveStart);
              layer.off('loadtileend', onLoadTileEnd);
              layer.off('saveend', done);
              resolve();
            };

            // タイル数が0の場合は saveend/loadtileend が発火しないため savestart で検知
            const onSaveStart = (e) => {
              total = e.lengthToBeSaved;
              ui.updateProgress(0, total, name);
              if (total === 0) done();
            };

            // loadtileend はキャッシュ済み・新規・エラーを問わず1タイルにつき1回発火する。
            // total 回発火した時点で全タイル処理完了。
            // leaflet.offline v3 の saveend はキャッシュ済みタイルがあると発火しないバグが
            // あるため、loadtileend カウントで完了を判定する。
            const onLoadTileEnd = () => {
              loadCount++;
              ui.updateProgress(loadCount, total, name);
              if (total > 0 && loadCount >= total) {
                // 最後のタイルの IndexedDB 書き込み完了を待ってから解決
                setTimeout(done, 0);
              }
            };

            layer.on('savestart', onSaveStart);
            layer.on('loadtileend', onLoadTileEnd);
            layer.on('saveend', done);   // 全タイル新規の場合の正常系バックアップ

            // confirm をここで上書きすることで、2500枚制限を維持しつつ
            // ユーザー確認ダイアログをスキップする
            saveControl.options.confirm = (status, cb) => {
              const count = status._tilesforSave?.length || 0;
              if (count > 2500) {
                ui.showError(`${name}: 枚数が多すぎます(${count}枚)。範囲を狭めてください。`);
                aborted = true;
                done();
                return;
              }
              cb();
            };

            saveControl._saveTiles();
          });
        }

        saveControl.options.confirm = origConfirm;
        saveControl._loadTile = origLoadTile;
        saveControl._saveTile = origSaveTile;
        if (activeBaseTileLayer) saveControl.setLayer(activeBaseTileLayer);
        if (!aborted) ui.showComplete('全レイヤーの保存が完了しました。');
        StorageManager.updateStorageInfo();
      });

      const container = L.DomUtil.create('div', 'leaflet-bar');
      container.appendChild(btn);
      return container;
    },
  });
  new SaveAllControl({ position: 'topleft' }).addTo(map);
  map.on('moveend zoomend', () => MapStateManager.save(map));

  // 7. オーバーレイと補助コントロール
  layerControl.addOverlay(createGsiVectorOverlay(), '道路（オンライン時のみ）');
  layerControl.addOverlay(createGsiPlaceNameOverlay(), '地名（オンライン時のみ）');
  L.control.scale({ imperial: false }).addTo(map);

  // 8. ストレージ管理
  StorageManager.updateStorageInfo();
  StorageManager.requestPersistence();

  // 9. 保存エリア表示・オフラインレイヤー管理
  setupStorageAreaOverlay(map, baseLayers, groupLayers);
  setupOfflineLayerList(map, baseLayers, groupLayers);

  window.map = map;
  return map;
}
