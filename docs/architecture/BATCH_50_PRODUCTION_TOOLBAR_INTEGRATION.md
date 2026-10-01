# Batch 50 — Production Toolbar Integration

Status: complete

Starting architecture head: `444a9a7cfda0fe336b8cb3b66bdf83e65b120275`

Validated implementation head: `0eeb964ec84017c04a11479df61b7fb9d1d2765f`

## Goal

Begin production-shell parity with the top-level CAD Lite toolbar and application menus, while continuing to route real behavior through the typed v1.6 runtime instead of reintroducing direct monolithic DOM/state mutation.

## Audit correction

The first two implementation commits in this batch exposed real typed controls but grouped them into generic `File / History / Snapping / Workspace / Insert / View` clusters.

A deliberate re-audit against the actual v1.5.99 source showed that this was technically safe but visually/product-structurally too generic. v1.5.99 uses a compact production toolbar with `EDIT / VIEW / INSERT / IMPORT / EXPORT` dropdowns alongside direct high-frequency controls.

The batch was therefore corrected before completion rather than treating the interim grouping as the new product design.

The corrected implementation also removed `aria-hidden` from the future modal/HUD portal container so interactive portal content is not structurally hidden from accessibility APIs.

## Production shell menu surface

Added `src/browser/production-shell-surface.ts` and mounted it through the standard browser runtime.

The surface is production-shell-specific and no-ops in the architecture harness. It owns only shell behavior:

- dropdown open/close state
- outside-click dismissal
- Escape dismissal
- proxy controls that delegate to existing authoritative controls
- EDIT-menu delegation into existing typed selection/actions

Meaningful CAD mutations remain owned by typed commands/controllers.

## Toolbar structure restored

The production shell now exposes the v1.5.99-style top-level structure:

- compact direct Undo / Redo
- direct Add Piece
- Piece Snap
- Grid Snap
- EDIT
- VIEW
- INSERT
- IMPORT
- EXPORT
- Reset / new-project lifecycle

The giant architecture-harness-style horizontal View row was removed from the production shell. DESIGN / SLAB remain in the workspace bar.

## EDIT

EDIT now exposes real bindings for:

- Undo — existing history control
- Redo — existing history control
- Copy — `CanvasSelectionActions.copy()`
- Paste — `CanvasSelectionActions.paste()`
- Duplicate — `CanvasSelectionActions.duplicate()`
- Delete — shared typed selection-deletion path
- Select All Pieces — `CanvasSelectionActions.selectAllPieces()`
- Deselect — `SelectionController.clear()`

Proxy controls mirror the authoritative Undo/Redo disabled state when the menu opens. Paste is disabled when the CAD Lite clipboard is empty; selection-dependent edit controls are disabled when nothing is selected.

## Shared selection deletion

Added `src/app/delete-selection.ts` with `deleteCanvasSelection()` so the production menu does not invent a new deletion implementation.

It delegates to the existing typed commands for:

- Pieces
- Dimensions
- Lines
- Notes
- Room Features
- Slabs

The global keyboard deletion path now uses this shared helper as well. Existing annotation-first handling in `PieceCanvasSurface` was intentionally left untouched in this batch to avoid changing proven tool/listener ordering while doing toolbar integration.

Added focused tests covering the shared deletion path across the supported selection families.

## VIEW

VIEW now behaves as a persistent palette like production: visibility buttons do not close the menu after each toggle.

Currently integrated typed controls include:

- Grid
- Piece Fill
- Piece Dims
- Seams
- Sink Centerlines
- Cutout Labels
- Slab Material
- Manual Dims
- Lines
- Notes
- Room Features
- Room Labels
- Cabinets
- Fillers / Panels
- Appliances
- Walls
- Number Format
- Fraction Precision

Existing browser surfaces remain the authoritative owners for the underlying preference updates.

## INSERT

INSERT currently provides real typed/runtime bindings for:

- Piece (`P`)
- Note (`N`)
- Dimension (`D`)
- Line (`L`)
- Blank Slab

Further production entries such as Quick Layouts remain acceptance items for a later shell slice rather than being represented by inert controls.

## IMPORT

IMPORT now exposes:

- Floor Plan (PDF / PNG / JPG), through the already-migrated `FloorPlanPreparationSurface`
- Project JSON, through `ProjectFileSurface`

## EXPORT

EXPORT currently exposes only the output that has a real v1.6 implementation behind it:

- Project JSON

The v1.5.99 PDF / PNG / SVG / share-link flows remain explicit production-parity work. This batch intentionally does not create dead or misleading menu items for output paths that have not yet been migrated.

## Project file lifecycle

The production shell now provides the real element IDs expected by `ProjectFileSurface` for:

- New / Reset project
- Import project
- Export project
- hidden file picker
- file-operation status

No second file lifecycle implementation was added.

## Validation

Architecture CI run: `36906495528`

Quality job: `110518242690`

Result: success.

Validated:

- TypeScript typecheck
- lint
- 332 / 332 tests across 47 files
- production build
- browser-ready artifact verification

Artifacts:

- JS: 355.00 kB / 88.65 kB gzip
- CSS: 35.95 kB / 6.13 kB gzip

During the corrected toolbar work, CI also caught a DOM typing issue around `HTMLElement.hidden` (`boolean | "until-found"`). The open-state logic was normalized to an explicit boolean before the batch was accepted.

## Production safety

Production `main` was re-verified after the integration work and remains frozen at:

`77728eed327f144b0b1c5d4b9562747d8d62074e`

No v1.5.99 production artifact was changed.

## Deliberate remaining toolbar gaps

Batch 50 does not claim complete top-level shell parity. Remaining production toolbar work includes, at minimum:

- Zoom +/- and production zoom semantics
- Fullscreen
- Theater mode
- remaining v1.5.99 VIEW entries such as additional label/overlay/canvas controls
- Quick Layouts
- slab image/library insert/import flow
- PDF export
- PNG export
- SVG export
- Copy Share Link
- final iconography/tooltips/spacing parity

These should be migrated as real capabilities, not placeholders.

## Recommended next batch

Batch 51 should continue with a focused **Navigator production integration** slice: restore the production left-column hierarchy around the already-migrated Project, Layouts, Materials/Selections, Areas, Piece Groups/Assemblies, Pieces, annotation lists, Floor Plan, and related collapsible/list behavior.

Toolbar viewport controls can then be handled as a separate small shell/viewport batch rather than blocking Navigator integration.
