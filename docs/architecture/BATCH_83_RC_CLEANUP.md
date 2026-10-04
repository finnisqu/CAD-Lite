# Batch 83 — Release Candidate Cleanup

## Goal

Prepare the v1.6 architecture branch for final cutover-readiness acceptance without redesigning product behavior or broadening the migration.

Batch 83 is deliberately conservative. It removes only source-proven staging/development leakage from production code, normalizes release identity, and freezes the expected production build contract.

## Release identity

The v1.6 runtime and npm project metadata now use the release identity `1.6.0`:

- runtime `CAD_LITE_ARCHITECTURE_VERSION`: `1.6.0`;
- `package.json`: `1.6.0`.

The dependency lockfile is intentionally not regenerated in this connector-only cleanup batch because a connector-side reconstruction produced unrelated third-party metadata churn during candidate review. Its dependency graph remains the validated Batch 82 graph. The production/runtime release identity and generated artifacts are not derived from the root lockfile version field.

The behavior baseline remains explicitly frozen at `v1.5.99`, and the persistence schema is unchanged.

## Production build contract

The existing Vite production configuration was already correct and is now explicitly protected by Batch 83 acceptance tests:

- production entry: `src/main.ts`;
- JavaScript artifact: `cad-lite-v1.6.0.js`;
- CSS artifact: `cad-lite-v1.6.0.css`;
- production source maps: disabled.

Batch 83 does not redirect any deployed site to these artifacts.

## Harness cleanup

`ProjectFileSurface` previously contained an `ensureHarnessControls()` fallback that dynamically created New / Import / Export controls only when it found `.cad-lite-architecture-harness__history`.

That was useful during migration, but it mixed development-harness markup policy into the production browser surface.

Batch 83 moves those controls to `dev/index.html`, where they belong, and removes the production fallback state/method. `ProjectFileSurface` now only binds existing file controls to `ProjectLifecycle` and owns the browser download/file-input behavior it actually needs in production.

The architecture harness remains available and retains the same file-management capability.

## Cleanup audit

A source search found no `console.log` statements and no `TODO` markers under `src` at the Batch 82 baseline. Batch 83 therefore does not manufacture cleanup churn where there is no source-proven defect or dead path.

The following are intentionally retained:

- the v1.5.99 compatibility importer;
- golden migration fixtures;
- architecture and development harnesses that still provide useful validation;
- compatibility and rollback documentation/artifacts;
- browser acceptance coverage added in Batches 81 and 82.

No domain behavior, geometry policy, command boundary, persistence schema, history semantics, DESIGN/SLAB behavior, or output behavior is intentionally changed.

## Automated acceptance

`tests/release-candidate-cleanup.test.ts` freezes:

- the shared `1.6.0` release identity across runtime and `package.json` metadata;
- `src/main.ts` as the production entry;
- final JS/CSS artifact names;
- disabled production source maps;
- file controls living in the dev harness rather than production fallback code.

`tests/build-info.test.ts` now requires `CAD_LITE_ARCHITECTURE_VERSION === '1.6.0'` while preserving the `v1.5.99` behavior-baseline assertion and the existing `getBuildInfo()` API contract.

The full Architecture CI gate remains authoritative for TypeScript, ESLint, Vitest, the production Vite build, and browser-ready artifact verification.

## Manual/browser acceptance status

Batch 83 does not erase the manual browser acceptance boundaries documented in Batches 81 and 82. Native file pickers, real PDF.js loading and large-PDF performance, native Fullscreen permission behavior, actual canvas/output visual fidelity, and final rendered interaction parity still require real-browser acceptance before production cutover.

## Production safety

`main` remains frozen at v1.5.99 during this batch. No production redirect, release deployment, or merge to `main` belongs in Batch 83.

## Next seam — Batch 84

Batch 84 is the final cutover-readiness acceptance pass. Its purpose is to answer one release question: **is the architecture branch safe to replace v1.5.99?**

Batch 84 should run the complete quality gate and final acceptance matrix across migration compatibility, difficult integrated projects, DESIGN/SLAB, commands/history, snapping, multi-selection, keyboard/tool lifecycle, persistence/recovery, old import/new re-export, outputs, themes, focus modes, Navigator/Inspector/HUD coordination, and stale-selection/duplicate-handler/direct-mutation protections.

The final report must include the exact architecture SHA, CI evidence/test count, known limitations, deferred work, rollback plan, frozen `main` SHA, and a deployment recommendation.

Do **not** merge or redirect `main` automatically after Batch 84. Stop at cutover-ready and obtain explicit approval.
