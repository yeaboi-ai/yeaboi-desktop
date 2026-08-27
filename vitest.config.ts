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
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      // Reproduces CI, which never downloads the Electron binary. See the stub.
      electron: resolve(import.meta.dirname, 'test/stubs/electron.ts'),
    },
  },
});
