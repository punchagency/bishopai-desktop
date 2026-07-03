import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Lightweight three-part build: main process, preload bridge, and the React
// renderer. electron-vite wires them together; no extra bundler config needed.
export default defineConfig({
  main: {
    build: {
      lib: { entry: resolve(__dirname, 'src/main/index.ts') },
    },
  },
  preload: {
    build: {
      lib: { entry: resolve(__dirname, 'src/preload/index.ts') },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    // Brand assets (icon.jpg) live at desktop/public and serve from '/'.
    publicDir: resolve(__dirname, 'public'),
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    resolve: {
      alias: { '@': resolve(__dirname, 'src/renderer/src') },
    },
    plugins: [react()],
  },
});
