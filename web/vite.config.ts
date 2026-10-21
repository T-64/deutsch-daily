import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// The app shell is built into ../docs/app and build.py stamps one HTML page per route from it,
// so the daily Python pipeline never needs Node. See DESIGN.md §Front end.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: '../docs/app',
    emptyOutDir: true,
    assetsDir: 'assets',
    target: 'es2020',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 700,
  },
  server: { port: 5173 },
});
