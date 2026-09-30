# Batch 13 — Piece transforms II

Behavior baseline: v1.5.99
Branch: architecture/v1.6-foundation
Starting architecture head: 95658cb89b9818024b7a9e988de7ae09af586d3f

## Production audit

The v1.5.99 transform paths were audited before extraction.

### Rotation

- Rotation handles are available in DESIGN and SLAB.
- DESIGN rotation expands converted fabrication assemblies and carries still-snapped linked splashes with their selected parent.
- A snapped linked splash cannot be rotated independently in DESIGN.
- SLAB rotation affects only the selected fabrication placements.
- Multi-Piece rotation is rigid around the selected family's axis-aligned bounding box center.
- The primary Piece follows the pointer angle.
- Shift hard-snaps the primary angle to 90 degree increments.
- Without Alt, angles within 5 degrees of a 90 degree increment soft-snap.
- Alt bypasses the soft angle snap.
- Double-clicking the rotate handle applies exactly +90 degrees.
- The whole rotated group receives one canvas correction vector rather than clamping members independently.

### Keyboard nudge

- Arrow keys move one Layout grid step.
- Shift+Arrow moves four grid steps.
- DESIGN nudge expands fabrication assemblies and still-snapped linked splashes.
- SLAB nudge affects only explicitly selected Piece placements.
- Selected Pieces move as one rigid group and are clamped as one group.
- A snapped splash nudged without its parent becomes detached.
- Repeated keydown movement is committed to history once on arrow keyup.

### Mirror

- Mirror H/V is DESIGN-only.
- A linked splash selected by itself pulls in its parent; a selected parent pulls in still-snapped linked splashes.
- The mirror axis is the selected family's DESIGN bounding-box center.
- World centers are reflected across that axis and each Piece rotation is negated.
- Piece-local metadata is mirrored: corner radii, edge profiles, countertop overhangs, Piece seam references, sink side/centerline/rotation, faucet pattern, and splash source edge.
- The v1.5.99 mirror routine does **not** alter cutout local coordinates or assembly-link side metadata. Batch 13 deliberately preserves that behavior rather than silently correcting it during migration.

### Width / height Inspector edits

- Width and height are shared Piece geometry, not workspace-specific geometry.
- A fabrication seam side acts as a fixed joint. Resizing grows or shrinks the exterior/opposite edge instead of moving the seam through fabrication details.
- Right/bottom anchored edits shift split sink/cutout fabrication coordinates so their physical joint location remains fixed.
- Piece seam offsets are clamped to the resized rectangle.
- Both DESIGN and SLAB poses are repositioned consistently around the fixed seam.
- Inspector-style dimensions retain the v1.5.99 three-decimal storage behavior.

## Architecture extraction

Batch 13 adds shared Piece transform services under `src/domain/pieces/transforms.ts`.

These services own:

- rotation-family expansion
- rigid group rotation
- rigid group nudge
- mirror-local metadata transformation
- graph-aware dimension resizing

The browser/controller flow remains:

Browser input → PieceInteractionController → transient InteractionState preview → Piece transform Command on commit → AppStore → History / Autosave / invalidation → read-only Canvas projection

Rotate and repeated keyboard nudge therefore use the same Batch 12 preview-before-commit architecture: pointer/key movement does not mutate Project geometry until the interaction is committed.

## Browser harness

The architecture harness now validates:

- rotate handle in DESIGN and SLAB
- soft 90 degree angle snap
- Shift hard 90 degree snap
- Alt soft-snap bypass
- rotate-handle double-click +90 degrees
- arrow-key nudge and Shift+Arrow four-grid nudge
- one nudge history step per key hold
- DESIGN Mirror H / Mirror V Inspector actions
- graph-aware Width / Height Inspector edits

## Deferred behavior

This batch still does not render or expose full editing UI for fabrication children. Their stored transform behavior is preserved so those entities arrive in the correct state when their projections are migrated.

Still deferred:

- sink rendering / sink hit testing / full sink Inspector
- cutout rendering / editing
- Piece seam rendering / editing
- support-footprint and Room Feature snap targets
- raw slab overlay edge-allowance snapping
- full production Piece Inspector styling
- selection marquee

## Next batch

The next coherent migration slice should begin fabrication-child projection on top of the now-stable Piece geometry/pose/transform foundation. Recommended order:

1. Piece seams
2. sinks
3. cutouts

Piece seams are the best first child domain because fabrication assembly links and graph-aware resize/rotation behavior are already established and tested.
