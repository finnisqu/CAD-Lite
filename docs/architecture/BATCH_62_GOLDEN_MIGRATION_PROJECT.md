# Batch 62 — Golden Migration Project

Status: **complete**

## Branch state

- Architecture branch: `architecture/v1.6-foundation`
- Batch 62 starting head: `8828611a71f1eff7c0441d5f0218f44360d546a6` (Batch 61 completion)
- Initial golden-project commit: `624e56f2f5d7539a131637efc8e956c3d8ec1a4b`
- Validated implementation head: `e2e2dbabecf44b256e47f3d44978fed5a265022c`
- Frozen production baseline: `main` at `77728eed327f144b0b1c5d4b9562747d8d62074e` (`v1.5.99`)
- Production was not modified.

## Goal

Batch 62 establishes one representative v1.5.99 project as an integrated regression oracle for the v1.6 migration. The project is intentionally broader than the small fixtures used by focused unit tests and is exercised across persistence, typed application state, rendering projections, output preparation, and canonical save/reload.

## Fixture ownership

Batch 62 exposed an important test-architecture boundary.

`tests/fixtures/v159-project.ts` remains the **minimal unit-test baseline**. Existing tests intentionally depend on its small entity counts and exact legacy geometry.

`tests/fixtures/v159-golden-project.ts` is the new **golden integration fixture**. It builds from the minimal baseline and adds representative production feature families without changing assumptions owned by focused tests.

The first implementation attempt expanded the shared minimal fixture in place. The new Batch 62 integration test passed, but 33 unrelated focused tests failed because their fixture contract had changed. The corrective commit restored the original fixture byte-for-byte and separated the golden integration project. This is now the deliberate fixture ownership model going forward.

## Golden project coverage

The golden project covers:

- project metadata and scratchpad
- multiple Stone Materials
- multiple Layouts and Areas
- grouped countertop Pieces
- Piece edge profiles, overhangs, and corner radii
- Sinks and faucet metadata
- rectangular and circular Cutouts
- planning seams and fabrication seam relationships
- linked backsplash / Splash attachment metadata
- Dimensions, Notes, Lines, and Note-leader relationships
- Room Features across cabinet, appliance, and wall categories
- calibrated Floor Plan state and export inclusion
- SLAB overlays on multiple Layouts
- production view/preferences and workspace state

## Integrated regression path

`tests/golden-migration-project.test.ts` validates the same project through three integrated scenarios.

### Legacy migration

The raw v1.5.99-style payload migrates to the current schema while preserving the representative feature families, relationships, active Area, layout extra metadata, Floor Plan calibration, and SLAB surfaces.

### DESIGN / SLAB / output projections

The migrated Kitchen is projected through the typed browser models:

- DESIGN Piece projection, including Sinks, Cutouts, planning seams, and fabrication seams
- annotation projection
- Room Feature projection
- Floor Plan projection
- production output metadata and deterministic filename preparation
- SLAB Piece + slab-surface projection

The test also verifies that DESIGN-only annotations, Room Features, and Floor Plan projection remain absent from the SLAB workspace.

### Canonical save / fresh reload

The project is imported through `ProjectLifecycle`, autosaved, exported to canonical CAD Lite JSON, loaded into a fresh lifecycle, and compared for exact project/preferences parity. The fresh canonical export must be byte-stable with the first canonical export.

## Validation

Validated at implementation head `e2e2dbabecf44b256e47f3d44978fed5a265022c` in Architecture CI run `37176291868`:

- TypeScript typecheck: pass
- ESLint: pass
- Vitest: **69 test files / 415 tests passed**
- Batch 62 golden migration tests: **3 / 3 passed**
- Vite production build: pass
- Browser-ready artifact verification: pass

## Deliberate boundaries

- Batch 62 does not modify production `main`.
- Batch 62 adds no new production runtime behavior.
- The golden fixture is an integration oracle, not a replacement for focused small fixtures.
- Broad whole-app visual polish and interaction QC remain outside this batch.

## Next recommended slice — Batch 63

Continue with **whole-app visual / interaction production QC** using the golden migration project as a regression and smoke-test reference:

1. Compare the v1.6 production shell against frozen v1.5.99 across DESIGN and SLAB workflows.
2. Walk representative Navigator, Inspector, toolbar, HUD, canvas, Floor Plan, output, and workspace interactions.
3. Fix only confirmed parity regressions and ownership leaks.
4. Keep the golden project stable unless a newly confirmed migration-critical production feature is missing from its coverage.
