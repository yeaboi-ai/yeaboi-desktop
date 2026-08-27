// CI runs with ELECTRON_SKIP_BINARY_DOWNLOAD=1, where importing `electron`
// throws "Electron failed to install correctly" the moment a test file reaches
// it. A developer machine usually has the binary, so the suite passed locally
// and went red on the PR.
//
// Aliasing `electron` here makes the local run behave like CI: a test that
// pulls in a module importing Electron fails immediately, and says why. Split
// the pure half out (see src/shared/notices.ts) rather than stubbing it here.

throw new Error(
  'a test imported a module that imports `electron` — CI has no Electron binary. ' +
    'Move the part under test into src/shared/ and keep the Electron call behind it.',
);
