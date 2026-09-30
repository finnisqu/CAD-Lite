import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  build: {
    target: 'es2020',
    sourcemap: mode !== 'production',
    emptyOutDir: true,
    lib: {
      entry: new URL('./src/main.ts', import.meta.url).pathname,
      name: 'CadLiteArchitecture',
      formats: ['iife'],
      fileName: () => 'cad-lite-v1.6.0.js',
      cssFileName: 'cad-lite-v1.6.0',
    },
  },
}));
