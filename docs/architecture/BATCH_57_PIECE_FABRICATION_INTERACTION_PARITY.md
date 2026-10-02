# Batch 57 — Piece / Fabrication Interaction Parity

Status: complete

Starting architecture head: `268b38dc4d3b4a51e89125f4e08c4d333984ae9a`

Validated implementation head: `49b791ab7ae517380ea660d0d29b4ac774afff9d`

## Goal

Audit the remaining production v1.5.99 Piece / fabrication interaction surface after Batches 54–56 and restore only clear, bounded parity gaps through typed v1.6 ownership.

This batch deliberately did not become a generic Inspector rewrite. The production source identified three related gaps worth restoring together:

1. Piece-list Shift+Click range selection
2. compact / reorderable Sink navigator behavior
3. compact / reorderable Cutout navigator behavior

A neighboring Seam audit did not reveal a production drag-order contract, so no synthetic Seam reorder feature was added.

## Production v1.5.99 audit

### Piece-list range selection

The frozen production implementation establishes these semantics:

- normal Piece-row click selects that Piece and moves the range anchor
- Ctrl / Cmd click toggles the Piece without moving the range anchor
- Shift+Click selects the inclusive range between the stored anchor and the clicked Piece
- the range is added to the existing Piece selection rather than replacing it
- selecting a Piece Group establishes the anchor at the highest member index

This behavior was documented in the production keyboard help and implemented directly against the production Piece order.

### Sink navigator

The frozen production source explicitly documents:

`order controls numbering + CL dimension lane priority`

Sink array order is therefore durable CAD behavior, not just visual list order.

Production Sink interaction also uses a compact navigator:

- Sink rows are collapsed by default
- one Sink editor can be open per Piece
- clicking a row toggles that Sink editor
- clicking buttons / inputs / the drag handle does not toggle the editor
- adding a Sink opens the newly-created row
- duplicating a Sink opens the copy
- Sink rows can be drag-reordered
- the reorder is saved and participates in history

### Cutout navigator

Cutouts use the same compact-list interaction family in v1.5.99:

- rows are collapsed by default
- one Cutout editor can be open per Piece
- clicking a row toggles its editor
- adding / duplicating opens the new Cutout
- rows have a dedicated drag handle
- drag reorder mutates the durable `piece.cutouts` order
- production redraws, saves, and pushes history after reorder

### Seam boundary

The production Seam Inspector uses ordinary seam cards. The audit did not find an equivalent Seam drag-order implementation or drag handle.

Batch 57 therefore stops at Sinks / Cutouts rather than creating an unverified symmetrical feature.

## Typed Sink ordering

Updated:

`src/domain/pieces/sinks.ts`

Added:

`movePieceSinkToIndex(piece, sinkId, targetIndex)`

Behavior:

- unknown Sink returns no mutation
- non-finite target indexes are rejected
- target index is clamped to the valid Sink array range
- same-index reorder returns the original Piece
- Sink identity and geometry are preserved
- only durable Sink array order changes

Added:

`src/app/commands/piece-sink-order.ts`

Command:

`reorderPieceSink(layoutId, pieceId, sinkId, targetIndex)`

Ownership:

- history: record
- persistence: save
- same-index / missing-entity operations are no-ops
- browser presentation never mutates `piece.sinks` directly

## Typed Cutout ordering

Added:

`src/domain/pieces/ordering.ts`

Helper:

`movePieceCutoutToIndex(piece, cutoutId, targetIndex)`

The helper follows the same typed ordering contract as Sinks:

- identity / geometry remain unchanged
- missing Cutout is rejected
- same-index reorder is a no-op
- target index is normalized into the valid Cutout range

Added:

`src/app/commands/piece-cutout-order.ts`

Command:

`reorderPieceCutout(layoutId, pieceId, cutoutId, targetIndex)`

Ownership:

- history: record
- persistence: save
- project replacement flows through the command layer
- production UI does not directly splice the typed Cutout array

Both ordering helpers / commands are exported through the existing Piece / command barrels.

## Production Piece interaction adapter

Added:

`src/browser/production-piece-interaction-parity-surface.ts`

This production-shell adapter restores the missing interaction semantics while leaving existing typed owners intact.

### Range selection

Normal click and Ctrl / Cmd toggle remain owned by the existing Project / Layout surface.

The parity adapter intercepts only the missing Shift+Click case and uses:

`mergePieceRangeSelection(...)`

This reproduces production behavior:

- inclusive anchor-to-target range
- additive selection
- stable Ctrl / Cmd anchor
- regular-click anchor updates
- Piece Group anchor updates.

Selection is still emitted through the typed `setSelection(...)` command.

### Sink compact navigator

The same adapter decorates the typed Sink rows with production presentation state:

- all editors begin collapsed
- one editor may be open per selected Piece
- row-header click toggles the active editor
- controls and reorder handles do not toggle rows
- newly-added / duplicated Sink ids are detected and opened automatically
- deleted Sink ids cannot remain as stale open state

The open-row state is browser/session presentation state; it is not added to the durable project schema.

### Sink reorder UI

When a selected Piece has at least two Sinks, the production adapter inserts a dedicated drag handle.

Dropping emits only:

`reorderPieceSink(...)`

The browser layer never owns Sink ordering data.

The v1.6 adapter uses the browser drag/drop event model rather than reproducing the legacy pointer-marker implementation internally. The durable production semantics—dedicated handle, reordered Sink array, history, persistence—are preserved.

## Production Cutout interaction adapter

Added:

`src/browser/production-cutout-interaction-parity-surface.ts`

The Piece interaction parity surface owns / mounts this narrower Cutout adapter so runtime wiring remains one Piece-parity surface.

Behavior:

- all Cutout editors begin collapsed
- one editor may be open per selected Piece
- header click toggles the editor
- controls / drag handle do not toggle the row
- a new / duplicated Cutout is automatically opened
- stale open ids are cleared after deletion
- reorder handle appears when at least two Cutouts exist
- drop emits `reorderPieceCutout(...)`

Again, open-row state remains presentation-only while Cutout array order remains typed durable state.

## Styling

Added:

`src/styles/production-piece-interaction-parity.css`

Loaded through `src/main.ts`.

The stylesheet provides production-shell-scoped treatment for:

- collapsed / expanded Sink fields
- collapsed / expanded Cutout fields
- interactive row headers
- selected / expanded header treatment
- Sink and Cutout drag handles
- dragging opacity
- drop-target outline

## Runtime integration

`src/browser/runtime.ts` now mounts:

`ProductionPieceInteractionParitySurface`

It sits with the other production-shell adapters after the core typed Piece-property surface and before the mode-specific production surfaces.

The Cutout parity adapter is internally mounted by the Piece parity surface rather than exposed as a second top-level runtime concern.

## Tests

Added:

`tests/piece-interaction-parity.test.ts`

Coverage includes:

- additive forward Piece range selection
- backward range selection
- selection de-duplication
- Sink reorder preserves Sink identity / data
- invalid Sink reorder
- same-index Sink no-op
- Sink reorder history entry
- Sink reorder undo
- Cutout reorder preserves Cutout identity / data
- invalid Cutout reorder
- same-index Cutout no-op
- Cutout reorder history entry
- Cutout reorder undo

The first focused checkpoint (Piece range + Sink reorder) was validated green at:

`2ab7f44f8376a191b7503fae6990e69ec836a91e`

with 393 / 393 tests across 63 files.

## Final validation

Validated implementation head:

`49b791ab7ae517380ea660d0d29b4ac774afff9d`

Architecture CI run:

`36956827252`

Quality job:

`110681537513`

Result: success.

Validated:

- TypeScript typecheck
- lint
- 395 / 395 tests across 63 files
- production build
- browser-ready artifact verification

Artifacts:

- JS: 441.51 kB / 107.43 kB gzip
- CSS: 82.93 kB / 11.09 kB gzip

## Ownership result

The final ownership stays explicit:

- Sink / Cutout order transformation: Piece domain
- history and persistence: typed commands
- Piece selection: existing typed selection command
- normal / Ctrl Piece-list selection: existing Project / Layout surface
- missing Shift-range semantics: production parity adapter
- compact Sink / Cutout editor state: production browser presentation
- drag affordance / drop targeting: production browser presentation

No production-shell code directly mutates typed Piece arrays.

## Batch boundary

This batch intentionally stops here.

The audit did not justify adding a Seam reorder feature, and the already-typed Sink / Cutout field editors remain the authoritative mutation owners for entity properties.

The next architecture slice should move out of Piece / fabrication micro-parity and restore the larger remaining production workflow.

## Recommended next batch

Batch 58 should audit and restore **Floor Plan production presentation / preparation parity** against frozen v1.5.99.

Priority areas to inspect before implementation:

- Prepare Floor Plan window structure and compact toolbar treatment
- import pipeline and large PDF behavior
- crop / erase behavior
- calibration controls and keyboard lifecycle
- rotate / grayscale / opacity / visibility controls
- canvas sizing interaction
- large-PDF eraser reliability
- modal / overlay / escape ownership

Use the existing typed Floor Plan domain / command work as the foundation; production UI should remain an adapter rather than owning Floor Plan state directly.

## Production safety

Production `main` remains intended to stay frozen at:

`77728eed327f144b0b1c5d4b9562747d8d62074e`

No v1.5.99 production artifact is part of this Batch 57 implementation.
