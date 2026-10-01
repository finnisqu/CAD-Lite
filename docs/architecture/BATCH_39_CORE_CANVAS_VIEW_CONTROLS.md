# Architecture Batch 39 — Core Canvas View Controls

Status: complete  
Starting architecture head: `3ff0ddc204a12fa29192041cb42265f7a21e5ca6`  
Validated implementation head: `451a16a5ad4798f9300ca9b59f9b4049deaa35a9`

## Scope

Continue the measured v1.5.99 View acceptance pass by closing two core visibility gaps that already exist in the typed preference model and rendering pipeline but were not exposed through the architecture browser View surface:

- Grid visibility
- Piece dimension visibility

## Implementation

`ViewPreferencesSurface` now owns browser controls for:

- `showGrid`
- `showDims`

alongside the existing Manual Dimensions, Notes, Lines, number format, and precision controls.

The new controls dispatch the existing `updatePreferences` command and therefore keep view state outside drawing entities and CAD Undo history. Existing workspace-specific preference persistence continues to determine DESIGN/SLAB memory semantics.

The architecture harness now exposes `Grid` and `Piece Dims` buttons using the IDs consumed by the typed browser surface, providing a direct browser acceptance path for both preferences.

## Tests

The View preference control tests now verify that:

- `lc-show-grid` maps to `showGrid`
- `lc-show-dims` maps to `showDims`
- existing annotation visibility controls remain mapped
- controls owned by other surfaces, including Seams and Object Snap, are not claimed by `ViewPreferencesSurface`

## Ownership boundary

This batch deliberately does not migrate controls already owned by `PieceCanvasSurface`, including Seams, Sink Centerlines, Cutout Labels, and Slab Material. It also does not fold Object Snap or Grid Snap into View preferences.

That keeps each browser control with one event owner and avoids duplicate toggles while the acceptance pass continues.

## Validation

Architecture CI run: `36890254174`

Validated successfully:

- TypeScript typecheck
- lint
- automated tests
- production build
- browser-ready artifact verification

## Deliberate boundary

No production UI redesign, rendering-rule change, new preference, or CAD behavior was introduced. Production `main` / v1.5.99 remains untouched.

## Next batch

Continue the measured acceptance audit and select the next explicit remaining View/Edit/canvas parity gap. Prefer a narrow behavior with a single clear browser owner and regression coverage.
