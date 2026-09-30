# Batch 15 — Sink foundation + rendering

Behavior baseline: v1.5.99
Branch: architecture/v1.6-foundation
Starting architecture head: 17f8df49887757820bc39d505b4b5ca0acfc1557

## Production audit

### Sink configuration

- Maximum four sinks per Piece.
- Default new sink is the Kitchen SS 3218 model: 31 × 17, rectangular, 4 in corner radius.
- Default reference side is Front.
- Front means the bottom / standing edge under the `front-bottom-v1` convention.
- Standard sink setback is 3.125 in.
- Default centerline is 20 in.
- Default faucet pattern is center position 4.
- Default faucet setback is 2.5 in from sink cutout edge to faucet-hole centerline.
- Default faucet-hole diameter is 1.5 in.
- Default adjacent faucet-hole spacing is 2 in.
- Default inside edge finish is Polished.

Catalog presets retained from v1.5.99:

- Kitchen SS 3218 — rect 31 × 17, R4
- Oval 1714 Vanity — oval 17 × 14
- Rectangle 1813 Vanity — rect 18 × 13, R0.25

### Reference-side geometry

Sink placement is stored relative to a Piece reference side, not as a general world-space object.

- Front base angle: 0°
- Left base angle: 90°
- Back base angle: 180°
- Right base angle: 270°

For Front/Back, centerline measures along Piece width. For Left/Right, centerline measures along Piece height.

Normal sink local centers are:

- Front: `(centerline, piece.h - (setback + sink.h/2))`
- Back: `(centerline, setback + sink.h/2)`
- Left: `(setback + sink.h/2, centerline)`
- Right: `(piece.w - (setback + sink.h/2), centerline)`

`fabricationPose {cx,cy}` is authoritative when present. This is how a sink spanning a converted fabrication seam can be represented on both child Pieces without changing its physical opening.

### Faucet geometry

The faucet rack contains nine indexed positions 0–8 centered around index 4.

- X = `(index - 4) * spacing` in sink-local coordinates.
- Y = `-(sink.h/2 + faucetSetback)`.
- Hole radius = `faucetHoleDiameter / 2`.

The rack lives on the sink-local back edge. This is why reference-side rotation is part of the sink model even when a symmetric bowl itself appears unchanged.

### Rendering

- Sink and faucet outlines render in both DESIGN and SLAB.
- Sink local rotation is reference-side angle + sink rotation.
- The whole sink projection then inherits the parent Piece workspace rotation.
- Split fabrication sink fragments are clipped to their child Piece geometry.
- Sink centerline dimensions render in both DESIGN and SLAB when `showSinkCenterlines` is enabled.
- Split fabrication sink fragments do not render centerline dimensions.
- DESIGN centerline lanes use 12 px Piece offset / 18 px lane spacing / 6 px ticks.
- SLAB uses 10 px Piece offset / 16 px lane spacing / 5 px ticks.
- Centerline display uses the same architectural fraction/decimal formatting as other canvas dimensions.

### Inspector behavior

v1.5.99 exposes:

- sink ordering/navigation
- rename
- duplicate
- delete
- Model vs Custom
- model preset
- custom Length / Width
- Rotation
- Corner Radius
- Inside Edge finish
- Reference Side
- Centerline
- Sink Setback
- nine-position faucet pattern
- Faucet Setback
- Faucet Diameter
- Faucet Spacing

Changing reference side clamps the existing centerline to the new Piece axis. Direct centerline edits remain decimal and are not silently quantized. Rotation edits are whole degrees. Most dimensional sink settings store to three decimals.

### Legacy side convention

v1.5.99 explicitly migrates payloads whose `sinkSideConvention` is not `front-bottom-v1` by swapping Front and Back. Batch 15 adds this missing compatibility step to the v1.6 import boundary.

## Architecture extraction

Batch 15 introduces typed sink entities and services under `src/domain/pieces/sinks.ts`.

`Piece.sinks` is no longer an opaque `FabricationChild[]`. Known sink fields are typed while unknown JSON metadata remains preserved at the compatibility boundary.

Typed services now own:

- catalog models and sink defaults
- reference-side angles
- centerline axis rules
- Piece-local sink pose
- faucet-hole geometry
- model application
- Inspector-style sink edits
- duplication and four-sink limit
- sink deletion
- mirror behavior

Batch 13's mirror and fabrication-aware resize services now consume the typed sink model directly. Split sink `fabricationPose` shifts no longer require generic JSON probing.

## Persistence

Sink normalization validates and normalizes:

- deterministic IDs
- type/model identity
- rect/oval shape
- dimensions
- corner radius
- reference side
- centerline and setback
- rotation
- faucet positions
- faucet setback / diameter / spacing
- inside finish
- fabrication split ID
- fabrication pose

Faucet settings follow production three-decimal normalization. Unknown future metadata is preserved.

## Commands and history

New sink commands:

- `addPieceSink`
- `editPieceSink`
- `copyPieceSink`
- `removePieceSink`

These commands use AppStore/history/autosave rather than mutating the Inspector's Piece object directly. The four-sink maximum is enforced at the domain/command boundary.

## Canvas projection

`PieceCanvasItem` now includes typed sink projections with:

- local center
- local rotation
- shape/path geometry
- faucet-hole geometry
- split-fragment state
- centerline visibility state

Sink projection consumes the same transient Piece geometry override as Piece rendering. During a resize preview, normal reference-positioned sinks therefore recalculate against the preview width/height without mutating Project state. Split sinks retain their authoritative fabrication pose.

The browser surface renders sink/faucet geometry before seams and selection overlays. Split sink shapes are clipped to the Piece path. Centerline dimensions use screen-space offsets converted through current canvas scale, matching v1.5.99's fixed-pixel lane behavior.

## Browser harness

The architecture harness now includes:

- Sink CL visibility toggle
- DESIGN sink/faucet rendering
- SLAB sink/faucet rendering
- clipped split fabrication sink rendering
- production architectural centerline labels
- Add Sink
- Duplicate Sink
- Delete Sink
- Name
- Type / Model
- custom Length / Width
- Rotation / Corner Radius
- Inside Edge
- Reference Side
- Centerline / Sink Setback
- nine-position faucet pattern
- Faucet Setback / Diameter / Spacing

Sink row drag-reordering and direct canvas centerline editing remain deferred. Imported order is preserved and continues to determine numbering / dimension lane priority.

## Deferred seam conversion

`Cut into Pieces` / fabrication seam Merge remain deferred until cutouts are typed. Sink split metadata is now ready for those operations, but a correct split/merge service still needs a typed cutout domain so it can coordinate every fabrication child without generic JSON mutation.

## Next batch

The next coherent slice is **Batch 16 — Cutout foundation + rendering**:

1. type cutout entities and defaults
2. migrate rectangle / oval / circle geometry and inside-finish semantics
3. project/render cutouts in DESIGN and SLAB
4. migrate the minimal Cutout Inspector
5. preserve split-cutout fabrication metadata

Once Batch 16 is complete, return to seam conversion/merge with Piece + seam + sink + cutout all typed.
