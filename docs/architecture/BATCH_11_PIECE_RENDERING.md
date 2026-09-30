# Batch 11 — Piece geometry and read-only rendering

Baseline audited: production cad-lite-v1.5.99.js at
77728eed327f144b0b1c5d4b9562747d8d62074e.
Architecture starting point: c752d08e44cb075ed7544a68fdd1e065506126cb.
Production files and main remain intentionally untouched.

## Production rendering audit

The v1.5.99 DESIGN and SLAB workspaces render the same Piece rectangle geometry.

- DESIGN draw sorts Pieces by ascending layer, computes the rotation-aware
  bounding-box size, treats x/y as the bounding-box origin, centers the original
  w/h rectangle inside that box, then rotates it around the common center.
- SLAB follows the same path construction and layer ordering but takes x/y/rotation
  from slabPlacement.
- Both use the same per-corner rounded rectangle path and the same Piece fill
  behavior: noFill or the global fill switch produces no fill; otherwise Piece
  color is drawn with Piece fill opacity multiplied by the Layout fill-opacity
  multiplier.
- Production migration/drawing helpers still round some slab placement and corner
  data to three decimals as a side effect. The typed v1.6 normalization boundary
  already owns compatibility cleanup, so rendering must not reproduce that
  mutation or precision loss.
- Production SLAB defaults to a 150 by 90 inch staging surface and retains/grows
  stored slabCW/slabCH. The v1.6 Piece-only projection reads preserved legacy
  slabCW/slabCH when available and otherwise grows a read-only view around Piece
  bounds. Slab inventory and overlay ownership remain deferred.

## Architecture decision

Piece rendering is split into two layers.

1. piece-canvas-model is a pure read-only projection from AppStore state. It calls
   pieceGeometry and piecePose, computes rotated bounds, center, rounded-rectangle
   path, fill appearance, layer order, and workspace canvas extent.
2. piece-canvas-surface is a thin DOM/SVG projection. It consumes that model and
   renders paths only. It dispatches only the existing DESIGN/SLAB workspace
   command from the harness controls.

No geometry is copied back into domain state. No renderer function rounds,
normalizes, clamps, or repairs Piece data. Equal layer values preserve source
array order explicitly.

DESIGN and SLAB therefore remain two views of the same Piece entities. Geometry
and appearance are shared; only pose and workspace extent differ.

## Deliberate boundary

This batch does not migrate:

- Piece pointer dragging
- resize handles or geometry editing
- selection hit testing or selection outlines
- snapping and alignment guides
- full Piece Inspector geometry controls
- sinks, cutouts, seams, edge profiles, dimensions, labels, slab material mapping,
  or other fabrication child rendering
- slab inventory ownership and editing

Those remain downstream batches rather than being embedded in the renderer.

## Browser harness

The architecture harness now includes DESIGN and SLAB controls plus a visible SVG
canvas. Its sample Pieces deliberately exercise decimal dimensions, rotation,
corner radii, layer order, fill opacity, no-fill behavior, and independent SLAB
poses. The SVG Piece groups are pointer-inert so the harness does not accidentally
introduce Piece interactions early.

## Validation

Regression coverage exercises geometry-to-render projection, rotated bounds,
independent corner radii, stable z-order, DESIGN versus SLAB poses, Piece fill
semantics, persistence-safe decimal precision, read-only projection behavior, and
SLAB extent growth.

The unchanged Architecture CI gate remains the acceptance gate: strict TypeScript,
ESLint, all Vitest suites, Vite build, and browser artifact verification.

## Next batch

Piece interactions should follow: selection hit testing, pointer dragging, resizing,
workspace-aware pose edits, snapping/alignment integration, and the corresponding
minimal Inspector geometry controls. Those interactions should consume this
projection and existing geometry services rather than reimplement render math.
