// Configuration Vite.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = process.env.EXPOSPACE_API_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: api, changeOrigin: false, ws: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: api, changeOrigin: false, ws: true } },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // React à part : Three.js non préchargé.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|react-router|cookie|set-cookie-parser)\//.test(id)) return 'react';
          if (/node_modules\/(three|@react-three|zustand|its-fine|react-reconciler|react-use-measure|suspend-react)\//.test(id)) return 'three';
          return undefined;
        },
      },
    },
  },
});
