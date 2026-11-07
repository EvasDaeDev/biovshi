import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: { __INLINE_ASSETS__: '{}' },
  build: { target: 'es2022', sourcemap: true },
});
