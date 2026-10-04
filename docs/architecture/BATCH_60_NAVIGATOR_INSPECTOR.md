# Batch 60 — Navigator / Inspector Production Parity

Status: **complete**

## Branch state

- Architecture branch: `architecture/v1.6-foundation`
- Batch 60 starting head: `da0eb4253e98226af12f1f3561f0ae4ea06df4c4` (Batch 59 completion)
- Validated implementation head: `dc67c0829048f383bc49c65b59dc8245b71c840f`
- Frozen production baseline: `main` at `77728eed327f144b0b1c5d4b9562747d8d62074e` (`v1.5.99`)
- Production was not modified.

## Audit result

Batch 60 audited the current typed Navigator / Inspector ownership before adding any new production adapter.

The important architecture result is that the existing ownership split is already correct and should be preserved:

- `ProjectLayoutSurface` owns typed Navigator / Inspector data projection, entity selection, rename/edit/delete actions, and Inspector context rendering.
- `ProductionShellSurface` owns production-shell chrome, including top-level menus and Navigator disclosure presentation.
- `ProductionInspectorSurface` owns production-only Inspector accordion presentation around the typed Inspector DOM.

A separate `ProductionNavigatorSurface` was deliberately **not** added because it would duplicate existing data and command ownership.

## Confirmed parity gaps closed

### Inspector disclosure relationships

`src/browser/production-inspector-surface.ts`

- Retains the existing MutationObserver-based decoration path so production Inspector chrome is reapplied after `ProjectLayoutSurface` replaces typed Inspector children.
- Retains Enter / Space keyboard activation on production Inspector disclosure headings.
- Adds stable production panel IDs for Piece and context Inspector sections.
- Adds `aria-controls` relationships from each production Inspector disclosure heading to the typed controls it expands or collapses.
- Preserves existing child IDs when present rather than overwriting typed DOM identity.
- Keeps the production Piece Inspector exclusive-section behavior and generic context collapse state presentation-only.

### Production shell disclosure relationships

`src/browser/production-shell-surface.ts`

- Adds stable panel IDs for production toolbar menu panels and Navigator section bodies.
- Adds `aria-controls` relationships for production menu triggers and Navigator disclosure buttons.
- Keeps native button keyboard behavior for shell disclosure controls.
- Extracts Navigator collapse-state toggling into a pure helper while retaining the existing localStorage preference behavior.
- Keeps CAD mutations delegated to typed controllers/actions rather than moving any entity ownership into the shell adapter.

## Tests added and extended

`tests/production-inspector-surface.test.ts`

- Retains Piece Inspector exclusive accordion-state coverage.
- Adds stable Inspector disclosure-panel ID coverage for Piece and context sections.

`tests/production-shell-surface.test.ts`

- Adds focused coverage for independent Navigator section collapse-state transitions.
- Verifies collapse-state helpers do not mutate the prior state set.
- Verifies stable production panel IDs for menu and Navigator disclosure surfaces.

## Validation

Validated at implementation head `dc67c0829048f383bc49c65b59dc8245b71c840f` in Architecture CI run `37173246230`:

- TypeScript typecheck: pass
- ESLint: pass
- Vitest full suite: pass
- Vite production build: pass
- Browser-ready artifact verification: pass

## Deliberate boundaries

- Batch 60 does not modify production `main`.
- Batch 60 does not create a second Navigator data/action owner.
- Typed Navigator entity behavior remains in `ProjectLayoutSurface` and related specialized typed surfaces.
- Production shell and Inspector adapters remain presentation-only.
- Output / export production parity remains Batch 61.
- Golden migration project / fixture work remains Batch 62.
- Whole-app visual QC remains Batch 63.

## Next recommended slice — Batch 61

Continue with **Output / Export production parity**:

1. Inventory frozen v1.5.99 PDF / PNG / SVG and project-export behavior against the typed architecture branch.
2. Separate export data preparation from browser download / presentation concerns where legacy code still mixes them.
3. Restore only confirmed production output gaps through typed data and deterministic rendering paths.
4. Keep broad visual polish for Batch 63 and avoid reopening Navigator / Inspector ownership unless a regression proves necessary.
