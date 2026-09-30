# Batch 12 — Piece interactions

Behavior baseline: v1.5.99
Branch: architecture/v1.6-foundation
Starting architecture head: e1ed8fc12e62659b149e92d9660494108bcdc030

## Production interaction audit

The v1.5.99 Piece interaction path was audited before extraction.

- Piece clicks are interaction-only. Selection changes do not create Undo history.
- A DESIGN drag does not begin until pointer travel exceeds 4 screen pixels.
- A SLAB drag uses a smaller 2 pixel threshold.
- DESIGN moves selected Pieces as one rigid translation. Converted fabrication
  assemblies expand as one countertop, and snapped linked splashes travel with
  their parent even when the splash was not explicitly selected.
- Ordinary Piece Groups select as a group first; a deliberate second click on an
  already selected Group drills into the clicked member.
- Ctrl/Cmd toggles individual Piece membership, except converted fabrication
  assemblies which remain one DESIGN selection.
- DESIGN object snapping compares moving edge/center anchors with other Piece or
  fabrication-assembly anchors. Grid snap is the fallback and Alt bypasses both.
- SLAB placement uses slabPlacement rather than DESIGN x/y/rotation. Piece-to-Piece
  same-edge alignment and cut-clearance placement are separate SLAB snap modes.
- Single-countertop resize handles exist in DESIGN only. Fabrication seam sides
  are locked. Default drag sizing quantizes to 1/8 inch; Shift bypasses that
  quantization and Alt bypasses both quantization and object snapping.
- Resize keeps the opposite edge anchored until canvas clamping is required.
- Inspector width/height edits change shared Piece geometry. Rotation edits affect
  the active workspace pose.

## Architecture extraction

Batch 12 adds a PieceInteractionController between browser input and Commands.

Browser pointer events
→ PieceInteractionController
→ Piece transform / selection Commands
→ AppStore
→ History / Autosave / invalidation
→ Canvas / Navigator / Inspector projections

The controller owns only an in-progress pointer snapshot. Persisted geometry and
poses remain exclusively in AppStore. Live drag/resize geometry is exposed through
InteractionState.preview and the canvas renders that preview without mutating the
Project.

The domain now exposes shared Piece pose/bounds/canvas helpers so rendering and
interaction math consume the same geometry rules.

## Object Snap preference

v1.5.99 persists Object Snap independently from Grid Snap. The canonical editor
preferences now promote pieceSnap as a first-class boolean with a true default.
Legacy export/snapshot migration reads it when present.

## Browser harness

The architecture harness now supports:

- Piece hit testing and single/multi selection
- blank-canvas deselection
- DESIGN and SLAB dragging
- Object Snap and Grid Snap toggles
- snap guide visualization
- selected Piece outlines
- DESIGN resize handles
- Width / Height / active-workspace Rotation controls in the minimal Inspector

These controls are deliberately architecture validation, not a visual reimplementation
of the full v1.5.99 production shell.

## Deferred dependent behavior

This batch intentionally does not pull unrelated domains forward just to satisfy
every old snap target.

Deferred until their owning projection/domain batches:

- Room Feature and wall snapping
- raw slab overlay edge-allowance snapping
- support-footprint guides
- sink/cutout-aware fabrication resize constraints
- linked-splash automatic length/resnap editing
- Piece rotate-handle and mirror interactions
- keyboard nudge and full Piece Inspector
- selection marquee

Piece-to-Piece DESIGN snapping, fabrication assembly selection, linked snapped
splash movement, Grid Snap, SLAB Piece clearance snapping, and seam-side resize
locking are included now because they are intrinsic Piece interaction semantics.

## Next batch

The next coherent Piece slice should migrate rotation/mirror/nudge behavior and
finish graph-aware Piece geometry editing, then move into fabrication-child
rendering (sinks, cutouts, seams) using the same read-only canvas projection.
