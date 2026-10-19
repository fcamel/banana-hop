# Versioning and deployment

## Default workflow

Development stays local until the user requests commit, push and/or deploy. Run only the authorized steps; a release request does not authorize discarding unrelated changes. A request for all three steps authorizes completing the release and verifying it without an additional confirmation.

The repository is `fcamel/banana-hop`; its production branch is `main`. Production site: [香蕉踩香蕉](https://fcamel.github.io/banana-hop/). Workflow: [Test and deploy GitHub Pages](https://github.com/fcamel/banana-hop/actions/workflows/pages.yml).

**A push to `main` starts deployment automatically.** Pull requests run validation without publishing. `workflow_dispatch` on `main` can redeploy an existing commit. Do not push `main` if the user explicitly requests “do not deploy”.

## Versions

Use three components everywhere: `MAJOR.MINOR.PATCH`. The package version, visible menu label and release asset query keys are synchronized by `scripts/version.cjs`.

- Local changes do not bump the release version.
- Every version change must include an entry in the separate [CHANGELOG.md](CHANGELOG.md), committed with the version bump. Use a version heading and a few concise bullets covering only important updates and significant bug fixes; omit detailed tuning values, implementation history and exhaustive change lists.
- A requested release defaults to one patch bump, even for gameplay changes. For example, `1.2.1` → `1.2.2`.
- Explicit minor bump: `1.2.1` → `1.3.0`; explicit major bump: `1.2.1` → `2.0.0`.
- An exact requested version or “不用動版號” takes precedence.
- Bump once for a release batch, not once per command. If deployment fails, retry the same commit/version rather than bumping again.

```sh
npm run version:patch
# Only if explicitly requested instead:
node scripts/version.cjs minor
node scripts/version.cjs major
node scripts/version.cjs 1.3.2
```

The script updates `package.json`, the main menu label in `dist/index.html`, and JS/CSS query keys in that HTML file. It creates no commit or tag and does not access the network. `npm run check` verifies the visible label matches the package version. Local cache-busting keys may differ from the release version during development.

## Local prerequisites and checks

- Node.js ≥22 (CI uses 24), Python 3; no npm package installation is required.
- Only asset generation requires Pillow. Use an available environment containing Pillow, or create a project virtual environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install Pillow==11.3.0
.venv/bin/python scripts/optimize-assets.py
```

Only currently used game artwork remains in `dist/assets/`; remove both PNG/WebP and their loader/cache/generator entries when artwork is retired. The 16 active PNG sources remain in `dist/assets/`; the script resizes to the delivery dimensions and writes transparent lossless desktop WebP in `dist/assets/` and same-resolution quality-85 mobile WebP in `dist/assets/mobile/`. Both sets are deployed. Before preloading, the browser selects one family using `matchMedia('(max-width: 650px), (pointer: coarse)')`, consistent with the touch layout; it does not parse User-Agent. The selection stays fixed until reload so rotation/resizing does not reload the full image set. The surf UI icon uses that same URL family and cache. Commit source PNG changes, the generator and regenerated delivery images together. Existing checked-in WebP files let a fresh checkout run locally without Pillow.

```sh
BANANA_AI_REPLAY=1 npm start
# In another terminal:
npm run check
npm test
git diff --check
```

### Development feature flags

`BANANA_AI_REPLAY=1 npm start` (also accepts `true`) enables AI/Replay on the local server. Without the environment variable, the browser feature is disabled. `scripts/serve.py` serves a dynamic, `Cache-Control: no-store` response for `features.js`, including HEAD requests and cache-key queries, without writing to `dist/`. Restart the server after changing the environment.

The checked-in `dist/features.js` always defaults to `aiReplay:false`; Pages serves this static file, so local environment settings cannot leak into deployment. `npm run check`, the feature tests and the upload step verify that production configuration remains disabled. Do not generate a development-enabled file in `dist/`. The local `/training/` dashboard and its API are gated by the same flag; its files live under `tools/`, outside the deployed `dist/`. Training history and replays live in ignored `.training/`; never include them in commits or Pages artifacts. See [TRAINING_DASHBOARD.md](TRAINING_DASHBOARD.md). Both the controls and their browser startup/import/export paths are gated across the main menu, pause and results screens. Command-line headless simulation remains available independently of the browser flag.

Gameplay parameters belong in `GAMEPLAY.md`; setup belongs in README; agent conventions belong in `AGENTS.md`.

## Release procedure

1. Inspect `git status`, current branch, remote and diff. Include the intended accumulated local work; preserve unrelated work. Confirm repository `fcamel/banana-hop` and production target `main` before publishing.
2. Apply the requested/default version bump once and add the matching concise entry to `CHANGELOG.md`. Update `GAMEPLAY.md` for changed rules, and regenerate WebP if needed.
3. Run `npm run check`, `npm test`, and `git diff --check`. Inspect desktop/mobile UI when relevant; check loading, version display and browser errors.
4. Stage explicit intended paths and commit with a title describing the version and changes. Example: `Release v1.2.2: improve boss summoning`.
5. If authorized, `git push origin main`. Do not force push. Resolve remote divergence without discarding work; run checks again if conflict resolution changes behavior.
6. Locate the Actions run for the **exact pushed commit SHA**, then wait for both validation and deployment to succeed. `gh` requires authenticated GitHub access; browser access can be used if available. Do not store a token in this repository.

```sh
gh run list --workflow pages.yml --branch main --limit 10
# Substitute the run ID whose headSha matches git rev-parse HEAD:
gh run watch RUN_ID --interval 10 --exit-status
gh run view RUN_ID --json headSha,status,conclusion,url
```

7. Fetch the live HTML with a fresh query string and confirm the expected menu version and JS/CSS query keys. Check at least a changed JS file or asset, not just the GitHub Actions status. Example:

```sh
curl --fail --location 'https://fcamel.github.io/banana-hop/?release=COMMIT_SHA'
```

8. Report the version, short commit SHA, deployment outcome and live URL. If a required check or deployment failed, say which step failed; do not mark the release complete.

The workflow in `.github/workflows/pages.yml` installs Pillow, regenerates WebP, checks JavaScript/version consistency, runs tests and uploads **only `dist/`** for Pages. Docs and source helpers remain in the repository. Existing PNG originals are also in the artifact, but the game requests only WebP.

## Failure handling

- A successful commit/push does not establish that the public site updated. Inspect the exact run and live output.
- A CI failure should be fixed locally and rechecked; push the fix only within the user's authorized release scope. Preserve the existing release version when retrying that same release.
- If authentication or network access is unavailable, retain the local commit and state what remains blocked. Never invent a successful push or deployment.
- Rollback is an explicit release action: obtain user authorization, prefer a revert commit and the normal workflow, and avoid rewriting production history.
