import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  optimizeDeps: {
    // leaflet.vectorgrid はグローバル L を前提とした生スクリプトのため
    // プリバンドルから除外し、transform プラグインが確実に動くようにする
    exclude: ['leaflet.vectorgrid'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // leaflet.vectorgrid は transform プラグインで処理するため除外
          'vendor-leaflet': ['leaflet', 'leaflet.offline'],
          'vendor-turf':    ['@turf/turf'],
          'vendor-geo':     ['proj4', 'shpjs', '@mapbox/leaflet-omnivore'],
          'vendor-ui':      ['bootstrap'],
          'vendor-misc':    ['jszip', 'piexifjs', 'idb', 'topojson-client'],
        },
      },
    },
  },
  plugins: [
    // leaflet.vectorgrid/dist/Leaflet.VectorGrid.bundled.min.js は UMD ラッパーが
    // なく L をグローバル変数として直接参照するため、leaflet の import を先頭に注入する
    {
      name: 'fix-leaflet-vectorgrid',
      transform(code, id) {
        if (/node_modules[/\\]leaflet\.vectorgrid/.test(id)) {
          return {
            code: `import __leaflet__ from 'leaflet';\nvar L = __leaflet__;\n` + code,
            map: null,
          };
        }
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', '*.geojson'],
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // src/ でインポートした SVG アセット（ハッシュ付き）もキャッシュ対象に含める
        globPatterns: ['**/*.{js,css,html,ico,png,svg,geojson}'],
        // public/ に残った非ハッシュ SVG はキャッシュしない（デプロイ漏れで 404 になるため）
        globIgnores: ['cloud-download.svg', 'vite.svg'],
      },
      manifest: {
        name: 'きみどりマップ',
        short_name: 'きみどりマップ',
        description: 'オフライン対応の地図アプリ',
        display: 'standalone',
        start_url: '.',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
