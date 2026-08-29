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
Co-Authored-By: Claude <noreply@anthropic.com>
```

Name the model that did the work, rather than pinning a version this file then has to chase.

## Gate

`make ship-gate` (shared tooling) runs the same set `ci.yml` does:

```
npm run lint            # tsc --noEmit
npm run format:check
npm test                # vitest
npm run build:check     # npm run build, then scripts/check-build.mjs over its output
node scripts/gen-routes-manifest.mjs --check
```

- **`lint` is `typecheck`.** No ESLint in this tree, and never was. With strict TypeScript on,
  `tsc --noEmit` is what actually rejects code, so that is what the target honestly runs.
- **Prettier is real**, and `.prettierignore` matters: `contracts/` is vendored byte-for-byte and
  the route manifest under it is generated, so reformatting either makes a `--check` unsatisfiable.
- **Electron is never downloaded in CI.** `ELECTRON_SKIP_BINARY_DOWNLOAD=1` in `ci.yml`; nothing
  in the ordinary loop launches it. `make pack` fetches it.
- **`build:check` exists because a bundler warning here is a hole in the app.** `npm run build`
  exits 0 on a `url()` it could not resolve — the asset is "resolved at runtime", where nothing
  resolves it. `@yeaboi-ai/design@1.0.0` shipped `fonts.css` without its three faces exactly that
  way, and the renderer fell back to the system font stack with every check green.

## Two contracts come from `yeaboi`

`contracts/v1/` holds exactly one file here — `routes_manifest.json`. (`app_http.md` is the other
half of the wire, but it lives in **yeaboi**; there is no vendored copy in this tree, and no
`.contracts-rev` or `make contracts-sync` either. Do not go looking for them.)

`routes_manifest.json` is **generated here and committed in both repos**: `npm run gen-manifest`
writes it from `src/renderer/lib/yeaboi/routes.json`, and yeaboi's `test_surface_parity.py` and
`test_tui_parity.py` read their copy to decide whether a capability reached the desktop.

So a route change is: edit `routes.json` → `npm run gen-manifest` → commit here → open a small
yeaboi PR carrying the regenerated manifest. `node scripts/gen-routes-manifest.mjs --check` (CI's
`manifest` job) is red in between, which is the point: the two repos cannot silently disagree about
what the app has. Never edit anything under `contracts/` by hand — `.prettierignore` exempts it so
that a formatter cannot make the two copies differ.

## Brand assets are committed, not built

`make icons` re-renders `build/` and the tray icons from the **yeaboi-site** duck art (`$YEABOI_SITE`,
else a sibling checkout). It borrows Pillow and matplotlib for the length of one command — there is
no Python environment here and this must not create one. `test/icons.test.ts` asserts the whole set
in the ordinary lane with no Python at all, parsing the generator's own tables so the two cannot
drift.

**A dev run is not the app.** `npm run dev` executes node_modules' stock `Electron.app`, and macOS
takes the Dock icon and the menu-bar title from *that* bundle — `app.setName()` reaches neither.
`scripts/dev-bundle-name.mjs` (a `predev` step) stamps it with `productName` and `build/icon.icns`,
then re-registers it with `lsregister`, without which the Dock keeps serving its cached "Electron".
The bundle is gitignored and every failure there is a warning, never a broken `dev`.

**The display name is `productName` in `package.json`, and only there.** `electron-builder.yml` does
not repeat it, an unpackaged run reads the same key for `app.getName()`, and the tray labels are
derived from it. `app.getPath('userData')` is deliberately pinned in `src/main/index.ts` so a rename
never moves anyone's `settings.json`. `test/packaging.test.ts`'s `identity` block is what fails when
half a rename lands.

## Releasing

`.github/workflows/release.yml`, **dispatch only**. Things to know:

- **The app's version is `package.json`'s; the wheel is the input.** The two are independent: bump
  the version by hand together with the head entry of `src/renderer/lib/yeaboi/shell-changelog.json`
  (the workflow refuses a mismatch — every release ships its notes), and dispatch with the
  `yeaboi_version` to bundle. It must only ever go up — electron-updater compares it, and the last
  shared-version release was `3.32.0` (hence the independent line starting at `4.0.0`). A rebuild of
  last month's app still bundles last month's yeaboi, because the wheel stays an explicit input.
- **This repo carries no release tags.** The tag lives in `yeaboi-desktop-releases`, created when
  the draft is published. There is deliberately no `push: tags` trigger: this clone shares an
  object store with the Python repo and has carried 141 of its tags, any one of which would
  otherwise start a signed build.
- **Installers publish to `yeaboi-ai/yeaboi-desktop-releases`**, a public repo, because this one is
  private. That needs `RELEASES_REPO_TOKEN` — a PAT scoped to that repo with Contents: write. The
  default `GITHUB_TOKEN` cannot write to another repository, and a secret may not be named
  `GITHUB_*`.
- **`electron-builder.yml`'s `publish` block is what `electron-updater` polls.** Pointed at the
  wrong repository, an installed app updates itself to nothing, silently, forever.
- **`--check` is what stops a green build shipping an empty app.** A missing `extraResources`
  source is only a warning in electron-builder, so a build that staged nothing signs, notarizes
  and publishes an installer that cannot start. Both staging scripts are run twice: once to stage,
  once to `--check`.
- **`mac.artifactName` carries no `${version}`.** yeaboi.ai links the dmgs through
  `/releases/latest/download/<asset>`, which resolves only while the name is stable.
- **The release is a draft until someone publishes it.** `--publish always` uploads before the
  Gatekeeper assessment runs and before the second arch exists. Finish with
  `gh release edit v<version> --repo yeaboi-ai/yeaboi-desktop-releases --draft=false`. Re-running
  after publishing skips the uploads with only a warning — delete the release first.
- **`latest-mac.yml` is merged after the fact.** The two mac legs each write one naming only their
  own arch and the second upload replaces the first; the `update-metadata` job merges them back.

## Rebase conflicts

Nothing generated is committed here except the icon set and the vendored contracts.

| Path | What to do |
|---|---|
| `package-lock.json` | Take upstream, then re-run `npm install` for your own change and commit the result |
| `contracts/**` | Take upstream, then `npm run gen-manifest` if you meant to move the manifest |
| `build/`, `resources/duck-*` | Take either side, then `make icons` — they are rendered, so neither side is authoritative |

## Clips

A clip here is `kind: "page"` with an `electron:` block — the repo's `demo_spec.py` is the example,
and its docstring lists the two prerequisites a plain `make install` does not satisfy:

- **The Electron binary.** CI sets `ELECTRON_SKIP_BINARY_DOWNLOAD=1` on purpose; if your tree has
  no `node_modules/electron/dist`, fetch it once with `node node_modules/electron/install.js`.
- **`YEABOI_DESKTOP_PYTHON`** must point at an interpreter that can `import yeaboi`. Without the
  `YEABOI_APP_READY` handshake the window only ever shows the splash duck — and a clip of the
  splash still passes verification, because verification proves a recording is alive, not correct.

Three things that are specific to this surface:

- **You cannot film a browser.** `src/renderer/api.ts` throws `preload bridge missing` without
  `window.yeaboi`, so pointing Playwright at the dev server captures an error page. It launches the
  built app, which is why the spec carries `"prepare": ["npm", "run", "build"]`.
- **Routes are hash routes** (`#/agents/usage`, `#/humans/planning`). Use the `hash` step, not
  `goto`: assigning `location.hash` never reloads, so window state survives across steps.
- **`ready` must key on real text, never the splash**, with a generous `ready_timeout` (the demo
  uses 60). Otherwise the take starts before the sidecar answers.

**CI does not replay clips in this repo** (`replay: false` in `ci.yml`). Driving one needs xvfb, the
skipped Electron binary and a working sidecar; a clip here is verified when it is recorded, by hand.
