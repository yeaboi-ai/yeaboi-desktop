import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only this repo's suite — parked git worktrees under .claude/ carry
    // their own test/ trees and must not run here.
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // The renderer's own root, same as electron.vite.config.ts. A pure module
      // under lib/ can still reach a sibling through '@/…', and vitest has to
      // resolve it the way the app does or the import graph dies at the first
      // one it meets.
      '@': resolve(import.meta.dirname, 'src/renderer'),
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      // Reproduces CI, which never downloads the Electron binary. See the stub.
      electron: resolve(import.meta.dirname, 'test/stubs/electron.ts'),
    },
  },
});
