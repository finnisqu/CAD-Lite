# Batch 14 — Piece Seam foundation + rendering

Behavior baseline: v1.5.99
Branch: architecture/v1.6-foundation
Starting architecture head: 15aebadb97ae638b01c74dfe2f3595784944bcd5

## Production audit

v1.5.99 keeps two seam concepts separate:

1. Planning seams stored on one Piece in `pieceSeams`.
2. Converted fabrication joints stored as paired `assemblyLinks` between real fabrication Pieces.

### Planning seams

- Stored as `id`, `orientation`, `reference`, and `offset`.
- Orientation is vertical or horizontal.
- Vertical seams reference Left or Right.
- Horizontal seams reference Top or Bottom.
- Rendering converts the reference-relative offset into a local Piece coordinate.
- Planning seams render dashed in both DESIGN and SLAB.
- DESIGN uses a 2 px non-scaling stroke with an 8/4 dash pattern.
- SLAB uses a 1.5 px non-scaling stroke with a 6/4 dash pattern.
- The global `showSeams` preference controls their visibility.
- Inspector Add Seam creates a vertical seam from Left at half the Piece width.
- Direction changes reset the reference to Left or Top and clamp the existing offset.
- Offset edits clamp to the active width/height and store at three-decimal production precision.

### Converted fabrication joints

- `Cut into Pieces` removes the planning seam from the original Piece and creates two real fabrication Pieces.
- The resulting joint is represented by paired `assemblyLinks` with a shared link ID, mating Piece IDs/sides, and the source planning seam ID.
- DESIGN draws each paired joint once as a heavier dashed line on the linked Piece edge.
- SLAB does not draw an extra fabrication-joint overlay because the physical Pieces are independently visible there.
- DESIGN selection/movement treats linked fabrication Pieces as one countertop; SLAB keeps their placements independent.

### Deliberate Batch 14 boundary

`Cut into Pieces` and seam Merge are not migrated in this batch.

Those operations remap/split sinks and cutouts as well as Piece geometry. Pulling them forward before typed sink/cutout domains would recreate the cross-domain mutation coupling that v1.6 is removing. Batch 14 instead makes the seam entities and projections correct first, while existing imported fabrication `assemblyLinks` already render correctly.

## Architecture extraction

Batch 14 introduces a typed `PieceSeam` domain and seam service with:

- seam orientation/reference types
- deterministic seam creation
- reference validation
- reference-relative local coordinate resolution
- three-decimal Inspector edit semantics
- add/edit/delete operations

`Piece.pieceSeams` is no longer an opaque generic fabrication child array. Unknown seam metadata is still preserved through the JSON compatibility shape while the known seam fields are typed and normalized.

Persistence normalization now:

- validates orientation
- validates compatible references
- clamps offset to Piece width/height
- preserves exact in-range decimal values
- keeps duplicate IDs deterministic

## Commands and history

New explicit commands:

- `addPieceSeam`
- `editPieceSeam`
- `removePieceSeam`

Each is deterministic, undoable, autosaved, and operates through AppStore instead of mutating the Inspector's Piece object directly.

## Canvas projection

`PieceCanvasItem` now carries read-only seam line projections.

Planning seams are projected from the current geometry used by the Piece projection. That means transient resize previews automatically move/clamp seams against preview geometry without mutating persisted seam state.

Converted fabrication joints are projected independently from `assemblyLinks` and only in DESIGN. Paired joints render once by stable Piece-ID ordering, matching the production behavior of avoiding duplicate overdraw.

The same projection respects `showSeams`; hiding seams removes them from the canvas projection without deleting any seam data.

## Browser harness

The v1.6 harness now supports:

- seam visibility toggle
- planning seam rendering in DESIGN
- planning seam rendering in SLAB
- converted fabrication-joint rendering in DESIGN
- Add Seam
- Direction
- From reference
- Offset
- Delete Seam

The harness intentionally does not expose Cut into Pieces yet.

## Test coverage

Batch 14 adds focused coverage for:

- typed seam migration and malformed legacy normalization
- duplicate seam IDs
- exact in-range decimal preservation
- production Add Seam defaults
- reference-relative seam coordinates
- orientation/reference edit behavior
- three-decimal offset edits
- command no-ops and history
- DESIGN planning-seam projection
- SLAB planning-seam projection
- DESIGN fabrication-joint de-duplication
- global seam visibility
- transient resize geometry projection

## Next batch

The next coherent fabrication-child slice should be **sinks**:

1. type the sink entity and its compatibility adapter
2. migrate sink pose/reference geometry
3. project/render sinks in DESIGN and SLAB
4. migrate the minimal sink Inspector
5. preserve split-sink fabrication metadata already used by Piece resize

After sinks, migrate cutouts. Once both child domains are typed, return to seam conversion/merge so the split/merge service can coordinate Piece + seam + sink + cutout state without falling back to opaque JSON mutation.
