# Agent working agreement

## Start here

- This repository is **香蕉踩香蕉 / Banana Hop**, a browser game made with plain JavaScript, Canvas and Web Audio. Reply to the user in Traditional Chinese by default.
- Read `GAMEPLAY.md` for current rules and tuning values, `DEPLOYMENT.md` for versioning and releases, and `package.json` for supported commands. Check `git status` before editing; preserve existing work.
- The canonical project is this Git checkout. Work from the checkout supplied to the session; do not assume a particular user home directory or a previous agent's temporary scripts, browser session, writable mirror or installed tools.

## Local development is the default

- Implement and verify locally. **Do not commit, push, deploy or bump the release version unless the user explicitly requests those actions.** A request to change gameplay is not release authorization.
- Perform only the requested release steps. A commit-only request does not authorize push/deploy. Pushing `main` automatically deploys through GitHub Actions; disclose this consequence if the user requests push while explicitly prohibiting deployment.
- When a release is requested, bump **patch** once per release batch by default (`1.2.1` → `1.2.2`). Honor an explicitly requested minor/major/exact version or “不要改版號”. Do not bump separately for commit, push and deploy in the same request.
- Whenever the release version changes, update the separate [`CHANGELOG.md`](CHANGELOG.md) in the same commit. Record only that version’s important updates and significant bug fixes in a few concise bullets; omit exhaustive change lists, tuning details, and implementation history.
- Once the user authorizes commit/push/deploy, finish the requested steps without asking for redundant confirmation. Never claim deployment succeeded based solely on a successful push.
- “先討論” means discuss first; do not implement an undecided design. For an implementation request, continue through implementation and appropriate checks. Prefer reasonable routine choices over repeated clarification.

## Implementation and verification

- Serve `dist/` on `http://127.0.0.1:8893/` (`npm start`), first checking whether that port is already serving this checkout. Do not stop an unrelated process.
- Entry points: `dist/game.js` (main loop, player, ordinary enemies, collision, audio), `dist/boss.js` (boss AI, ceremonies, music), `dist/surf.js` (consumable surf), `dist/index.html`, `dist/style.css`.
- Script order is `boss.js`, `surf.js`, `game.js`; these files share global lexical bindings. Preserve load order and initialize DOM elements before registering handlers.
- Keep the native browser implementation; do not introduce a framework, package dependency or external service without a concrete need.
- For gameplay fixes, add meaningful regression coverage to `tests/game.test.cjs`; run `npm run check` and `npm test`. Documentation-only edits need document/link/diff checks, not a full gameplay test run.
- When changing UI, assets, camera, mobile controls, fullscreen or animation, inspect the relevant browser state and check console/runtime errors when browser tooling is available. Distinguish desktop emulation from testing on an actual phone; do not claim device coverage you did not perform.
- Update `GAMEPLAY.md` whenever rules or parameters change. It is the **single gameplay parameter reference**; do not duplicate tuning tables in README or agent instructions. Source code and regression tests determine actual behavior; reconcile discrepancies explicitly.
- Do not change balance, enemy limits or mechanics merely to hide performance bugs. Keep collision behavior intact while optimizing. New visuals should match existing character art, avoid harsh brightness and clutter, and favor animation feedback over extra information cards/text.
- Preserve original PNG artwork. Game delivery uses the generated WebP assets. Run `scripts/optimize-assets.py` after source art changes; do not flatten transparent character art to JPEG. See deployment instructions for Pillow setup.
- For local JS/CSS changes, change HTML asset query keys when necessary to avoid stale browser caches, without changing the visible release version. The release script synchronizes version labels and query keys.

## Reporting and recovery

- Give concise progress updates during substantial work. Report what changed, how it was verified, and whether it remains local or was published.
- Do not include credentials, personal files, temporary benchmarks, logs or screenshots in commits. Do not reset or discard user changes.
- If sandbox permissions require approval, use the environment's escalation mechanism for the authorized operation. If rejected, report the stated block accurately; do not invent a separate approval policy.
- New branches, if needed, use `codex/`; do not create a new branch or PR solely to replace an explicitly requested direct release on `main`.
