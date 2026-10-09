import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    injectRegister: 'auto',
    includeAssets: ['favicon.svg','icon-192.png','icon-512.png'],
    manifest: { name: 'Cuentitos — Mi biblioteca', short_name: 'Cuentitos', description: 'Tus cuentos en la nube y sin conexión.', lang:'es', start_url:'/', scope:'/', display:'standalone', theme_color:'#315641', background_color:'#fbfaf6', icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}] },
    workbox: {
      globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
      globIgnores: ['tesseract/**'],
      maximumFileSizeToCacheInBytes: 3*1024*1024,
      navigateFallback: '/index.html',
      cleanupOutdatedCaches: true,
      // No Supabase endpoints or private PDFs enter the shared service-worker cache.
      runtimeCaching: [{urlPattern: /\/tesseract\//, handler:'CacheFirst', options:{cacheName:'cuentitos-ocr',expiration:{maxEntries:6,maxAgeSeconds:60*60*24*30}}}],
    },
  })],
});
