# repo-notes — yeaboi-desktop

The facts `/ship` and `/sync-main` do not hardcode. Keep this short; anything longer than a page is
a skill, not a note.

## What this repo is

The sixth yeaboi surface: an Electron shell whose renderer is a normal Vite/Preact ESM app over
`yeaboi app`, the loopback HTTP backend in the `yeaboi` package. It publishes signed installers,
never a library.

**Nothing here builds Python, and nothing here pins a yeaboi version.** An installer wraps a wheel
that is already on PyPI, named at release time.

## Commit

No pre-commit hooks here — commit normally. Trailer:

```
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

## Gate

`make ship-gate` = `lint` → `format-check` → `test` → `build` → `contracts-check` → `tooling-check`
→ `check-manifest` → `build-check`.

- **`lint` is `typecheck`.** No ESLint in this tree, and never was. With strict TypeScript on,
  `tsc --noEmit` is what actually rejects code, so that is what the target honestly runs.
- **Prettier is real**, and `.prettierignore` matters: `contracts/` is vendored byte-for-byte and
  the route manifest under it is generated, so reformatting either makes a `--check` unsatisfiable.
- **Electron is never downloaded.** `ELECTRON_SKIP_BINARY_DOWNLOAD=1` in CI and in
  `scripts/provision.sh`; nothing in the ordinary loop launches it. `make pack` fetches it.
- **`build-check` exists because a bundler warning here is a hole in the app.** `npm run build`
  exits 0 on a `url()` it could not resolve — the asset is "resolved at runtime", where nothing
  resolves it. `@yeaboi-ai/design@1.0.0` shipped `fonts.css` without its three faces exactly that
  way, and the renderer fell back to the system font stack with every check green.

## Two contracts come from `yeaboi`

`contracts/v1/` is **vendored**, pinned by sha in `.contracts-rev`. Never edit anything under
`contracts/`; `make contracts-check` fails on an edited-in-place copy and prints a note (not a
failure) when the pin is merely behind.

| File | Direction | What that means here |
|---|---|---|
| `app_http.md` | yeaboi → here | The wire. Changing it is a **yeaboi PR first**, then `make contracts-sync`. |
| `routes_manifest.json` | here → yeaboi → here | Generated from `src/renderer/routes.json` by `npm run gen-manifest`, but **committed in yeaboi**, whose surface-parity suite reads it. |

So a route change is: change `routes.json` here → `make gen-manifest` → open a small yeaboi PR with
the regenerated manifest → merge it → `make contracts-sync` here. `make check-manifest` is red in
between, which is the point: the two repos cannot silently disagree about what the app has.

## Brand assets are committed, not built

`make icons` re-renders `build/` and the tray icons from the **yeaboi-site** duck art (`$YEABOI_SITE`,
else a sibling checkout). It borrows Pillow and matplotlib for the length of one command — there is
no Python environment here and this must not create one. `test/icons.test.ts` asserts the whole set
in the ordinary lane with no Python at all, parsing the generator's own tables so the two cannot
drift.

## Releasing

`.github/workflows/release.yml` on a `v*` tag or a dispatch. Two things to know:

- **The version is an input, never derived from the tree.** `package.json` says `0.1.0` on `main`
  and the workflow stamps the real number at build time — a rebuild of last month's app must bundle
  last month's yeaboi.
- **`electron-builder.yml`'s `publish` block is what `electron-updater` polls.** Pointed at the
  wrong repository, an installed app updates itself to nothing, silently, forever.

## Rebase conflicts

Nothing generated is committed here except the icon set and the vendored contracts.

| Path | What to do |
|---|---|
| `package-lock.json` | Take upstream, then re-run `npm install` for your own change and commit the result |
| `contracts/**` | Take upstream, then `make contracts-sync` if you meant to move the pin |
| `build/`, `resources/duck-*` | Take either side, then `make icons` — they are rendered, so neither side is authoritative |
