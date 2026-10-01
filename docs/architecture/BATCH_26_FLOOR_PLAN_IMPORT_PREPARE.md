# Batch 26 — Floor Plan Import & Prepare

## Goal

Restore the v1.5.99 Floor Plan ingestion and preparation workflow on top of the typed Batch 25 Floor Plan context without turning pixel-edit operations into application state.

Batch 25 established the persistent `FloorPlan` model. Batch 26 owns the transient browser workflow that produces or calibrates that model.

## v1.5.99 behavioral source

The frozen production implementation at `main` / v1.5.99 remains the behavior baseline.

Production behavior confirmed during this batch:

- a Floor Plan belongs to one Layout
- PDF, PNG, JPG, and JPEG can be imported
- PDFs are rasterized in the browser before persistence
- prepared images are persisted as raster `dataURL` content, not as PDF bytes
- crop, level, erase, rotate, and preparation Undo/Redo operate on temporary pixel canvases
- preparation history is local to the Prepare Floor Plan workspace
- the final prepared raster enters project history as one Floor Plan command
- calibration scales X and Y uniformly
- distance calibration stores known/measured distance and factor metadata
- 24-inch-square calibration stores the production `square24` metadata shape
- successful calibration locks the plan
- plan-driven canvas resizing preserves installed drawing offsets from the old canvas center

## Domain and command changes

### `syncLayoutCanvasToFloorPlan`

A pure domain helper now owns the production `syncCanvasToPlan` behavior.

When a prepared or recalibrated Floor Plan requires a different Layout canvas size:

1. calculate the rotated Floor Plan bounds including margin
2. calculate the installed drawing extents around the previous canvas center
3. use the larger required width/height
4. translate DESIGN geometry by the old-center → new-center delta

Translated DESIGN content:

- Pieces
- manual Dimensions
- Drawing Lines
- Notes
- Room Features

Piece `slabPlacement` is intentionally untouched because it belongs to the independent SLAB workspace pose.

The 1-inch production breathing-room rule is retained when drawing content, rather than the Floor Plan, determines the required canvas size.

### Typed calibration commands

Batch 26 adds:

- `calibrateFloorPlanDistance(...)`
- `calibrateFloorPlanSquare(...)`

Both commands are:

- active-Layout only
- DESIGN-only
- blocked when the plan is locked
- history-recording
- autosave-persisted
- atomic with the resulting Layout canvas synchronization

### 24-inch square metadata

The square workflow writes the production-compatible calibration record:

```text
mode: square24
knownWidth: 24
knownHeight: 24
measuredDistance: <measured side on canvas>
factor: 24 / measuredDistance
updatedAt: <ISO timestamp>
```

## Browser architecture

The initial implementation was deliberately split after static analysis exposed that a single preparation surface was becoming too large.

### `floor-plan-preparation-surface.ts`

Thin coordinator responsible for:

- hidden file input
- accepted import formats
- replacement confirmation
- switching import intent back to DESIGN
- routing image files to preparation
- routing PDFs to page selection, then preparation
- routing Navigator calibration commands
- committing only final prepared Floor Plans

### `floor-plan-pdf-import.ts`

Owns PDF-specific browser work:

- lazy loading PDF.js 3.11.174
- worker configuration
- page-count discovery
- page selector
- raster preview
- full-resolution selected-page rasterization

PDF.js remains a browser adapter dependency and is not part of the persisted project model.

### `floor-plan-image-editor.ts`

Owns the transient Prepare Floor Plan pixel workspace:

- crop selection
- Focus Crop / Show Full preview
- Level line → nearest 90-degree correction
- white eraser brush
- adjustable brush size
- ±90-degree rotation
- preview zoom
- discrete local Undo / Redo
- Reset
- final maximum-dimension reduction
- WebP output with JPEG fallback

No pointer movement or brush segment enters the application Store, project History, or Autosave stream.

Only **Import Plan** creates the typed `setFloorPlan(...)` command.

### `floor-plan-calibration-surface.ts`

Owns transient canvas calibration interactions:

- two-point known-distance calibration
- draggable 24-inch square
- movable square
- resizable square from corners
- calibration overlay rendering
- compact over-canvas confirmation controls

Only calibration confirmation emits a typed application command.

### `floor-plan-modal.ts`

Shared browser modal/button primitives used by PDF selection, image preparation, and distance entry.

## Navigator workflow

The non-selectable Floor Plan context card now exposes:

- Import when empty
- Replace
- Prepare
- point-to-point Calibrate
- 24-inch Square calibration
- visibility
- lock/unlock
- Flip X / Flip Y
- 90-degree rotation
- opacity
- grayscale
- include in export
- delete

Prepare and calibration actions are disabled while the plan is locked.

The Floor Plan remains context; it is not added to shared CAD Selection.

## History boundary

This batch deliberately preserves two different history layers:

### Local preparation history

Temporary canvas snapshots store discrete crop/erase/transform commits while the preparation dialog is open.

They disappear when the dialog closes.

### Project history

Project History receives only meaningful domain changes:

- prepared/replaced Floor Plan commit
- calibration commit
- persistent plan display/transform changes from the Navigator

This prevents pixel brush movement from consuming global Undo depth or flooding Autosave.

## Regression coverage

Batch 26 extends Floor Plan tests to cover:

- center-preserving Layout resize
- translated DESIGN geometry
- unchanged Piece `slabPlacement`
- production-compatible 24-inch-square calibration metadata
- typed point-distance calibration command
- typed 24-inch-square calibration command
- calibration locking

## Deliberate boundary after Batch 26

Not expanded in this batch:

- PDF.js bundling/offline packaging; v1.5.99 CDN loading is retained for parity
- automatic OCR or dimension recognition
- vector PDF preservation; Floor Plans remain raster context
- arbitrary image filters beyond grayscale display
- making Floor Plans normal selectable CAD entities
- moving preparation brush operations into global project History

The next architecture batch should continue from the next remaining production subsystem rather than adding feature scope to Floor Plans unless QC identifies a parity defect.
