# Batch 16 — Cutout foundation + rendering

Behavior baseline: v1.5.99
Branch: architecture/v1.6-foundation
Starting architecture head: 702a309726b4994992b9da6ff72fe526a02b172a

## Production audit

### Cutout kinds and defaults

v1.5.99 supports three general countertop cutout kinds:

- Rectangle
- Circle
- Oval

Legacy `cooktop` cutouts migrate to Rectangle.

Default names are:

- Rectangular Cutout
- Circular Cutout
- Oval Cutout

General cutouts default to **Unpolished** inside edge.

Default geometry:

- Rectangle: 6 × 4, R0, rotation preserved/normalized
- Oval: 6 × 4, R0, rotation 0 on kind change
- Circle: 2 in diameter, R1, rotation 0

New cutouts are centered on the Piece.

### Piece-local geometry

Cutouts store their center directly in Piece-local coordinates:

- `cx` = centerline from the Piece's left edge
- `cy` = centerline from the Piece's back/top edge

Non-split cutout centers normalize into the Piece bounds.

A cutout carrying `fabricationSplitCutoutId` is different: it preserves the original opening center even when that center lies outside an individual child Piece. This allows one physical opening crossing a fabrication seam to be represented as clipped fragments on both child Pieces.

Manual Inspector CL edits still clamp to the current child Piece even for split fragments. Batch 16 preserves that distinction: persistence/projection may retain an out-of-bounds split center, while the edit command follows Inspector clamping.

### Shape normalization

Circle:

- diameter minimum 0.125 in
- width/height mirror diameter
- corner radius = diameter / 2
- rotation forced to 0

Oval:

- width/height minimum 0.125 in
- corner radius forced to 0
- rotation normalized into 0–360

Rectangle:

- width/height minimum 0.125 in
- corner radius clamped to half the smaller dimension
- rotation normalized into 0–360

Dimension and position editor values use production three-decimal normalization where v1.5.99 normalizes them.

### Rendering

General cutouts render in both DESIGN and SLAB.

- Every cutout layer is clipped to Piece geometry.
- Rectangle uses rounded-rectangle geometry.
- Oval uses ellipse geometry.
- Circle uses circle geometry.
- Cutout rotation is Piece-local; Circle rotation is always 0.
- The whole cutout projection inherits the parent Piece workspace rotation.

Inside-edge finish controls stroke weight:

- Unpolished: normal 1 px outline
- Polished: heavier 2 px outline

### Labels

`showCutoutLabels` controls cutout labels without hiding cutout geometry.

Labels render only when the opening's minimum size is at least 4 in.

Polished cutouts add a second `POLISHED` label beneath the cutout name.

For a seam-split cutout, v1.5.99 moves the label toward the center of the portion actually visible on that child Piece. Batch 16 migrates that local-space label-offset calculation.

### Perimeter / LF

The Inspector reports cut-edge linear footage.

Full perimeter formulas follow production:

- Circle circumference
- Ramanujan-style oval perimeter approximation
- Rounded-rectangle perimeter

The displayed LF counts only boundary segments whose midpoint actually passes through stone. Therefore cutouts clipped by a Piece edge report less than full perimeter and display `clipped by piece edge`.

### Inspector behavior

v1.5.99 exposes:

- add Rectangle / Circle / Oval
- rename
- duplicate
- delete
- Type
- Inside Edge finish
- Diameter for Circle
- Width / Height for Rectangle and Oval
- CL from Left
- CL from Back
- Rotation for Rectangle and Oval
- Corner Radius for Rectangle
- cut-edge LF readout

Duplicate behavior:

- inserts immediately after the source
- appends `Copy` to the display name
- shifts local center by +1 in X and +1 in Y, clamped to the Piece
- clears `fabricationSplitCutoutId`

Cutout ordering is preserved because it controls Navigator ordering. Drag-reorder remains deferred from the architecture harness.

## Architecture extraction

Batch 16 introduces typed cutout entities and services under `src/domain/pieces/cutouts.ts`.

`Piece.cutouts` is no longer an opaque `FabricationChild[]`. Known cutout fields are typed while unknown JSON metadata remains preserved through the compatibility shape.

Typed services now own:

- kind labels and default names
- default cutout creation
- kind changes
- geometry normalization
- Inspector-style edits
- duplication/deletion
- full perimeter
- effective clipped perimeter
- rotated local bounds
- split-fragment label offsets

Batch 13's fabrication-aware resize service now shifts typed split-cutout coordinates directly instead of reading/writing generic child JSON.

## Persistence

Cutout normalization now handles:

- deterministic IDs
- `cooktop` → Rectangle compatibility
- default names
- Rectangle / Circle / Oval kind validation
- center defaults and clamping
- split-center preservation
- width/height/diameter minima
- corner-radius rules
- rotation normalization
- inside-finish defaulting
- fabrication split identity
- unknown metadata preservation

## Commands and history

New explicit commands:

- `addPieceCutout`
- `editPieceCutout`
- `copyPieceCutout`
- `removePieceCutout`

These commands are undoable/autosaved and route edits through AppStore rather than mutating the Inspector's Piece object directly.

## Canvas projection

`PieceCanvasItem` now includes typed cutout projections with:

- kind
- local center
- local rotation
- dimensions/diameter
- rounded-rectangle path when applicable
- polished state
- split-fragment state
- label visibility
- fragment-aware local label offset

Projection uses the same transient Piece geometry override as Piece rendering.

For a transient resize preview:

- normal cutouts are read-only normalized against preview Piece dimensions, matching production draw-time clamping without mutating Project state
- split cutout centers remain authoritative and may stay outside the child Piece
- fragment-aware label placement recalculates against the preview Piece bounds

## Browser harness

The v1.6 harness now supports:

- Cutout Labels visibility toggle
- Rectangle / Circle / Oval rendering in DESIGN
- Rectangle / Circle / Oval rendering in SLAB
- Piece clipping
- polished edge styling
- cutout labels + POLISHED annotation
- split-fragment label positioning
- Add Rectangle / Circle / Oval
- Duplicate
- Delete
- Name
- Type
- Inside Edge
- Diameter or Width / Height
- CL from Left / Back
- Rotation
- Corner Radius
- effective cut-edge LF

Cutouts are hidden from the Inspector for backsplash Pieces, matching the production boundary.

## Test coverage

Batch 16 adds focused tests for:

- legacy kind migration
- default names and finishes
- circle/oval normalization
- split center preservation
- duplicate IDs
- defaults for all three kinds
- kind switching and generic/custom name behavior
- Inspector position/dimension/rotation/radius rules
- duplicate offset + split-ID clearing
- full/effective perimeter
- rotated bounds
- split label offsets
- command history/no-op behavior
- DESIGN projection
- SLAB projection
- label visibility
- split labels
- transient resize geometry behavior

## Next batch

With Piece, planning seams, sinks, and cutouts now typed, the next coherent slice is **Batch 17 — Fabrication seam conversion + merge**.

That batch can finally migrate `Cut into Pieces` and fabrication Merge as one coordinated domain transaction that owns:

- Piece splitting/merging
- assembly links
- planning seam removal/remapping
- sink split fragments and `fabricationPose`
- cutout split fragments
- child Piece poses in DESIGN and SLAB
- undo/autosave as one operation

This is the point where the v1.6 fabrication graph can replace the large cross-domain mutation routine from v1.5.99 instead of reproducing it.
