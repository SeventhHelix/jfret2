/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { chunkSizeWarningLimit: 1500 }, // alphaTab (Guitar Pro import) is a ~1.2 MB chunk, loaded only on import
  test: { environment: 'node' },
});
