import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone build of the SAME renderer the Electron app ships — no
// main/preload process, no window.innerlume bridge. lib/platform.ts is what
// lets the renderer run under either: it reads window.innerlume when present
// (desktop) and falls back to VITE_BACKEND_URL / the hosted default when it
// isn't (this build). See README.md for how to point a build at a backend.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  // .env / .env.web live next to package.json, not under src/renderer.
  envDir: __dirname,
  publicDir: resolve(__dirname, 'public'),
  // Relative asset paths — this output is meant to be dropped at any path on
  // any static host, not assumed to sit at a domain's root.
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src/renderer/src') },
  },
  plugins: [react()],
});
