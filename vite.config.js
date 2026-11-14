import { defineConfig } from 'vite';
import {buildVersion} from './scripts/build-version.mjs';

export default defineConfig({
  base: './',
  define: { __INLINE_ASSETS__: '{}', __BUILD_VERSION__: JSON.stringify(buildVersion) },
  build: { target: 'es2022', sourcemap: true },
});
