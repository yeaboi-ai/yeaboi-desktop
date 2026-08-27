import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only this repo's suite — parked git worktrees under .claude/ carry
    // their own test/ trees and must not run here.
    include: ['test/**/*.test.ts'],
  },
});
