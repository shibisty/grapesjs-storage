import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      // UMD global: window.grapesjsStorage = { default: pluginFn, render, MemoryContentStore, ... }
      name: 'grapesjsStorage',
      fileName: (format) => (format === 'umd' ? 'grapesjs-storage.umd.cjs' : 'grapesjs-storage.js'),
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      // GrapesJS is never bundled: the plugin runs on the host page's instance.
      external: ['grapesjs'],
      output: { exports: 'named', globals: { grapesjs: 'grapesjs' } },
    },
    sourcemap: true,
  },
});
