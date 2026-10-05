import { defineConfig } from 'vite';

export default defineConfig({
  root: 'smoke',
  publicDir: false,
  build: {
    target: 'es2020',
    sourcemap: false,
    emptyOutDir: true,
    outDir: '../dist-smoke',
  },
});
