import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const renderer = resolve(import.meta.dirname, 'src/renderer');

// The renderer is the planning UI as a React 19 SPA. It was written for
// Next.js; rather than editing sixty files, the Next surface it touches is
// aliased to small local shims (routing over react-router, identity over the
// preload bridge). "use client" directives are inert string literals under
// Vite and are left in place.
const rendererAliases = {
  '@': renderer,
  // Plain data both processes agree on (the duck's preference shape).
  '@shared': resolve(import.meta.dirname, 'src/shared'),
  // @yeaboi-ai/design ships SOURCE .tsx — Vite compiles it here (see esbuild
  // note below). The alias pins the import root inside the package.
  '@design': resolve(import.meta.dirname, 'node_modules/@yeaboi-ai/design/design'),
  'next/navigation': resolve(renderer, 'shims/next-navigation.ts'),
  'next/link': resolve(renderer, 'shims/next-link.tsx'),
  'next/dynamic': resolve(renderer, 'shims/next-dynamic.tsx'),
  'next-auth/react': resolve(renderer, 'shims/next-auth.tsx'),
};

export default defineConfig({
  main: {
    build: {
      lib: { entry: 'src/main/index.ts' },
    },
  },
  preload: {
    build: {
      // Two preloads: the app's narrow bridge, and the pet's narrower one.
      lib: { entry: { index: 'src/preload/index.ts', pet: 'src/preload/pet.ts' } },
      rollupOptions: {
        // Sandboxed preloads cannot load ESM — emit CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    // @yeaboi-ai/design ships SOURCE .tsx, and esbuild does not apply this
    // project's tsconfig jsx settings to files under node_modules — without
    // this it falls back to the classic transform and the window comes up
    // blank on "React is not defined". Set it here, where it covers every
    // file Vite transforms rather than only the ones tsconfig reaches.
    esbuild: {
      jsx: 'automatic',
    },
    resolve: {
      alias: rendererAliases,
    },
    server: {
      fs: {
        allow: [import.meta.dirname],
      },
    },
  },
});
