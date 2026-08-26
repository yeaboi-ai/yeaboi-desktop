# yeaboi-desktop

The desktop app for [yeaboi](https://yeaboi.ai) — an Electron shell over `yeaboi app`, the loopback
HTTP backend that ships inside the `yeaboi` Python package.

The renderer is an ordinary Vite/Preact ESM app. It is deliberately **not** one of the front end's
IIFE bundles: that constraint exists for `file://` exports and tunnel CSPs, and neither applies to a
window the shell itself opens. It draws its chrome from
[`@yeaboi-ai/design`](https://www.npmjs.com/package/@yeaboi-ai/design), published by
[yeaboi-frontend](https://github.com/yeaboi-ai/yeaboi-frontend).

## What ships is a released wheel, not this tree

An installer bundles a **published** `yeaboi` from PyPI inside a pinned python-build-standalone
runtime, staged at `resources/py` and shipped as `Resources/py`; `src/main/sidecar.ts` spawns
`Resources/py/bin/python3 -m yeaboi app`. The app's version *is* the version of the yeaboi it
carries — this repo has no version line of its own.

```bash
make install                     # npm ci, without the Electron binary
make test                        # typecheck + vitest
make bundle VERSION=3.31.0       # stage the interpreter + that release
make pack                        # unsigned local package into dist/ (a smoke test)
```

`make dev` runs the shell against a **sibling yeaboi checkout** (`../yeaboi.ai`, or `$YEABOI_REPO`);
`$YEABOI_DESKTOP_PYTHON` names an interpreter directly instead.

## Two things cross a repo boundary

- **`contracts/v1/app_http.md`** — the wire this shell speaks. Vendored from
  [yeaboi](https://github.com/yeaboi-ai/yeaboi.ai) at the sha in `.contracts-rev`; never edited here.
- **`contracts/v1/routes_manifest.json`** — the route surface, code-generated from
  `src/renderer/routes.json` by `npm run gen-manifest`. yeaboi's surface-parity suite reads it to
  decide whether a capability reached the desktop, so it is **committed in yeaboi** and vendored
  back. `make check-manifest` fails when this repo's registries and that snapshot disagree.

Adding a route is therefore two PRs: this one, then a small yeaboi one carrying the regenerated
manifest, then `make contracts-sync` here.

## Releasing

`.github/workflows/release.yml`, on a `v*` tag or a dispatch. It refuses a version that is not a
final `X.Y.Z` already on PyPI, builds and signs on four runners, asks Gatekeeper what it thinks of
the mac build, and publishes a draft GitHub release that `electron-updater` polls.
