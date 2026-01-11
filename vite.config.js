import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate', // SWの自動更新設定
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', '*.geojson'], // キャッシュに含める静的資産
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // ビルド時に生成される JS/CSS に加え、publicフォルダのgeojsonも含める設定
        globPatterns: ['**/*.{js,css,html,ico,png,svg,geojson}'],
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