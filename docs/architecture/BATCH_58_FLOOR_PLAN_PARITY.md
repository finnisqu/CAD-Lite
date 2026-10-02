# Batch 58 — Floor Plan Production Parity

Status: **complete**

## Branch state

- Architecture branch: `architecture/v1.6-foundation`
- Batch 58 starting head: `a1802fb34052bdfe95fd4840a27e0e2cd9893ee3`
- Validated implementation head: `3785180dde77691bd349b8b52288b8a3cd5514d8`
- Frozen production baseline: `main` at `77728eed327f144b0b1c5d4b9562747d8d62074e` (`v1.5.99`)
- Production was not modified.

## Audit result

The existing typed Floor Plan foundation from Batches 25, 26, and 33 already owned the persistent Floor Plan model, DESIGN canvas projection, import/preparation surfaces, calibration math, calibration keyboard behavior, visibility, opacity, grayscale, mirror state, rotation, lock state, and canvas synchronization.

Batch 58 therefore remained a parity-closure batch rather than a subsystem rewrite. The frozen v1.5.99 production implementation was used to identify interaction and presentation behavior that had not yet been restored on the architecture branch.

## Confirmed parity gaps closed

### Modal lifecycle and keyboard ownership

`src/browser/floor-plan-modal.ts`

- Mounts Floor Plan dialogs inside the active fullscreen element when applicable.
- Carries the current dark theme into modals that live outside the `.lite-cad` root.
- Restores Escape-to-close behavior.
- Shields normal canvas shortcuts while a Floor Plan modal is open while leaving editable controls usable.
- Restores backdrop-click close behavior and prior focus on close.

### Navigator geometry controls

`src/browser/floor-plan-navigator-surface.ts`

- Restores the v1.5.99 `Canvas Margin` control.
- Restores `Fine Align · 1/16"` directional nudging and Center.
- Restores offset readout.
- Locks geometry controls with the Floor Plan.
- Corrects Replace so a locked Floor Plan cannot be replaced through the navigator.
- Reuses the existing typed `updateFloorPlan` command, so Canvas Margin changes continue through the architecture canvas-sync owner rather than duplicating layout movement logic in the browser surface.

### PDF page preparation

`src/browser/floor-plan-pdf-import.ts`

- Restores page-preview Zoom − / Zoom + / Fit controls.
- Restores 90° page rotation before preparation.
- Restores a scrollable high-resolution preview rather than forcing the page into a fixed preview canvas.
- Restores the production-scale PDF rendering range.
- Prepares the selected page at high resolution and hands the editor a PNG source plus page-qualified name.

### Prepare Floor Plan editor

`src/browser/floor-plan-image-editor.ts`

- Restores a compact grouped preparation toolbar.
- Restores Reset Crop.
- Restores horizontal and vertical pixel-level Flip operations.
- Restores reversible cleanup with a first-erase baseline and Reset Cleanup.
- Restores the production eraser range of 8–240 px.
- Keeps erase strokes continuous between pointer samples, which is important on large plan images.
- Preserves the local preparation undo/redo boundary rather than writing intermediate editor actions into global project history.
- Commits an active crop before rotate / flip / level transforms so hidden full-sheet content is not transformed behind a focused crop.

### Floor Plan presentation CSS

`src/styles/floor-plan-preparation.css`

- Restores compact grouped editor-control styling.
- Adds scrollable PDF preview presentation suitable for zoomed / large pages.
- Restores Canvas Margin and 1/16" fine-alignment control layout.
- Restores modal dark-theme presentation.

### 1/16-inch precision regression

`src/domain/floor-plans/index.ts`

The new parity test exposed an architecture-only precision defect: Floor Plan offsets were normalized through `round3`, so the v1.5.99 1/16-inch nudge value `0.0625` became `0.063`, allowing repeated nudges to drift.

Floor Plan offsets now retain four decimal places. This preserves exact sixteenth-inch alignment while leaving the rest of the established Floor Plan size/margin normalization unchanged.

## Tests added

`tests/floor-plan-parity.test.ts`

- Verifies that 1/16-inch Floor Plan offsets survive the typed command/model path exactly and do not resize or move the drawing.
- Verifies that Canvas Margin changes resize around the existing drawing center while fabrication-only slab placement remains untouched.

## Validation

Validated at implementation head `3785180dde77691bd349b8b52288b8a3cd5514d8`:

- TypeScript typecheck: pass
- ESLint: pass
- Vitest: **397 / 397 tests passed across 64 test files**
- Vite production build: pass
- Browser-ready artifact verification: pass
- Generated architecture artifacts:
  - `dist/cad-lite-v1.6.0.js`
  - `dist/cad-lite-v1.6.0.css`

An earlier parity-test run deliberately failed because it exposed the three-decimal offset regression described above. The model was corrected rather than weakening the legacy-parity expectation, and the final validation run is green.

## Deliberate boundaries

- Batch 58 does not change production `main`.
- Batch 58 does not broaden into general HUD/modal migration; that remains Batch 59.
- `includeInExport` Floor Plan state remains present, but final export/output enforcement and multi-layout output verification remain part of the planned output/export batch.
- Pixel-perfect whole-app visual comparison remains part of the later Visual QC batch.

## Next recommended slice — Batch 59

Continue with **HUDs and modals**:

1. Inventory every v1.5.99 floating mode HUD and modal against current typed owners.
2. Confirm production mounting and lifecycle for each existing architecture HUD/modal before adding anything.
3. Close only verified gaps in mode-specific floating controls, dialog ownership, dismissal/Escape behavior, scope controls, and theme/fullscreen presentation.
4. Keep Navigator/Inspector broad parity work for Batch 60 unless a HUD/modal dependency requires a narrowly scoped adapter.
