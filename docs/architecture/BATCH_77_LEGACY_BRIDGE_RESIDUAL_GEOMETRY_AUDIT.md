# Batch 77 — Legacy / Bridge / Residual Geometry Audit

Status: complete pending final CI

Starting architecture head: `a031ceb6f7ef04c260039db620e9507119c3c185`

## Goal

Audit the post-Batch-76 architecture for temporary compatibility wrappers, legacy boundaries, and browser-owned pure math that can now be removed or migrated safely. This batch is intentionally convergent: remove only bridges whose replacement is already proven, reuse existing geometry where behavior is identical, and retain compatibility code that still serves the v1.6 release contract.

## Changes

### Removed the obsolete production scroll adapter

Batch 64 retained `anchoredProductionScroll()` as a thin compatibility wrapper while viewport geometry was first extracted. By Batch 77 the production viewport surface can depend directly on `anchoredViewportScrollOffset()` without crossing an ownership boundary.

`ProductionViewportSurface` now calls shared viewport geometry directly for Ctrl/Cmd-wheel pointer anchoring. The production-specific `nextProductionCanvasScale()` adapter remains because it still combines generic scale stepping with real application policy: the production zoom step and the authoritative minimum/maximum canvas scale.

The duplicate wrapper-level anchor test was removed. `tests/viewport-geometry.test.ts` already owns the pure anchored-scroll invariant; the production viewport suite continues to test production zoom policy, history coalescing, and theme behavior.

### Migrated Floor Plan calibration screen/world math

`nudgeFloorPlanCalibrationSquare()` previously implemented its own `px / scale` conversion. It now delegates that calculation to `screenDistanceToWorld()`.

The production behavior is unchanged:

- Arrow key: 1 screen pixel;
- Shift+Arrow: 10 screen pixels;
- unusable calibration scale: preserve the historical 16 px/in fallback;
- calibration square remains clamped inside the DESIGN canvas.

A focused regression now locks the fallback behavior for zero and near-zero scales.

## Compatibility audit decisions

### v1.5.99 importer — retained intentionally

`src/persistence/legacy/v159.ts` is not dead migration scaffolding. It remains an explicit compatibility adapter because:

- importing v1.5.99 project payloads is part of the v1.6 cutover acceptance contract;
- the Batch 62 golden migration project exercises this path;
- legacy sink-side migration and editor-state normalization are isolated cleanly behind the persistence boundary.

Do not remove this adapter during generic cleanup. Reassess historical compatibility only after v1.6.0 release requirements explicitly change.

### Floor Plan image-editor math — retained intentionally

`floor-plan-image-editor.ts` still contains local pixel-space rotation/distance/projection calculations. Those calculations operate between browser client space, displayed image space, and source-image pixels. They are not automatically equivalent to DESIGN/SLAB world geometry merely because they use `Math.atan2`, `Math.hypot`, or rectangle scaling.

Batch 77 therefore does not force them into shared CAD geometry. Extract them later only if a reusable image-space abstraction has a demonstrated second consumer or if browser acceptance exposes a defect.

## Ownership after Batch 77

- generic anchored-scroll math: `src/geometry/viewport.ts`;
- production zoom step/range policy: `ProductionViewportSurface` through `nextProductionCanvasScale()`;
- generic screen-distance conversion: `src/geometry/viewport.ts`;
- Floor Plan calibration nudge policy/fallback/clamping: `floor-plan-calibration-model.ts`;
- v1.5.99 compatibility migration: `src/persistence/legacy/v159.ts`;
- source-image editing math: remains browser/image-editor-owned.

## Validation

The final Batch 77 commit must pass the normal Architecture CI gate:

- TypeScript;
- ESLint;
- full Vitest suite;
- production Vite build;
- browser-ready artifact verification.

## Handoff

Batch 78 should perform the dependency-direction / renderer-ownership cleanup promised by the release roadmap. Audit imports and mutation ownership rather than continuing broad geometry extraction. High-value checks include geometry/core depending upward on app/browser, browser renderers performing business mutations directly, duplicate command ownership, and compatibility wrappers with no remaining consumers.

Do not restart the architecture or manufacture abstractions where the dependency graph is already clean.
