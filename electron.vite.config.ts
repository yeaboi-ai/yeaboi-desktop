import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

import { planningPortRange, rendererCsp } from './src/shared/csp';

const renderer = resolve(import.meta.dirname, 'src/renderer');
// The boards' own front end. The retro and poker boards are React apps in the
// yeaboi-frontend checkout, and the desktop renders the real thing rather than
// a picture of it — see src/renderer/board/board-api.ts for the one seam.
const boards = resolve(import.meta.dirname, '../yeaboi-frontend/src');

// The renderer is the planning UI as a React 19 SPA. It was written for
// Next.js; rather than editing sixty files, the Next surface it touches is
// aliased to small local shims (routing over react-router, identity over the
// preload bridge). "use client" directives are inert string literals under
// Vite and are left in place.
// Longest keys first: alias matching is prefix-based, so a bare `react` ahead
// of `react-dom` would swallow it.
const rendererAliases = {
  // The boards are compiled from a checkout with its own node_modules, where
  // React is aliased to preact/compat. Left alone, its components build preact
  // elements and this app's React refuses them as "not a valid React child" —
  // so every React specifier is pinned to this project's copy, whoever imports
  // it.
  // The board checkout's tsconfig sets `jsxImportSource: preact`, and Vite
  // honours the tsconfig nearest the file — so its components compile against
  // preact's JSX runtime whatever this project asks for. Pointing preact's own
  // specifiers at React is what actually settles it.
  'preact/jsx-dev-runtime': resolve(import.meta.dirname, 'node_modules/react/jsx-dev-runtime.js'),
  'preact/jsx-runtime': resolve(import.meta.dirname, 'node_modules/react/jsx-runtime.js'),
  'preact/compat': resolve(import.meta.dirname, 'node_modules/react'),
  'preact/hooks': resolve(import.meta.dirname, 'node_modules/react'),
  'react/jsx-dev-runtime': resolve(import.meta.dirname, 'node_modules/react/jsx-dev-runtime.js'),
  'react/jsx-runtime': resolve(import.meta.dirname, 'node_modules/react/jsx-runtime.js'),
  'react-dom/client': resolve(import.meta.dirname, 'node_modules/react-dom/client.js'),
  'react-dom': resolve(import.meta.dirname, 'node_modules/react-dom'),
  react: resolve(import.meta.dirname, 'node_modules/react'),
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
  '@board': boards,
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
    plugins: [
      react(),
      tailwindcss(),
      {
        // The boards talk to their own server over `fetch` on their own origin,
        // which is neither true nor allowed here: the address carries the host
        // secret, which lives in main. Their HTTP client — and only that module
        // — is swapped for one that goes through the bridge.
        name: 'yeaboi-board-transport',
        enforce: 'pre' as const,
        resolveId(source: string, importer?: string) {
          if (!importer?.startsWith(boards)) return null;
          if (!/^(\.\.?\/)+runtime\/api$/.test(source)) return null;
          return resolve(renderer, 'board/board-api.ts');
        },
      },
      {
        // One CSP, generated from the ports this process will use, so the
        // policy and the probe cannot disagree. A packaged build runs this at
        // build time with no block set, so it gets the 8000-based policy.
        name: 'yeaboi-renderer-csp',
        transformIndexHtml(html: string) {
          const csp = rendererCsp({ planningPorts: planningPortRange() });
          return html.replace(
            '<title>',
            `<meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <title>`,
          );
        },
      },
    ],
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
      // Was Vite's default 5173 with auto-increment — both a collision with
      // retro/server.py and nondeterministic across worktrees. strictPort only
      // when a block assigned one: with no block, 5173 genuinely is contended
      // and today's auto-increment is the working behaviour.
      port: Number(process.env['YEABOI_DESKTOP_DEV_PORT']) || undefined,
      strictPort: Boolean(process.env['YEABOI_DESKTOP_DEV_PORT']),
      fs: {
        allow: [import.meta.dirname, boards],
      },
    },
  },
});
