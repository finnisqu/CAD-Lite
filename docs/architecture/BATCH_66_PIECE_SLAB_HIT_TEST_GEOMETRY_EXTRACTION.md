# Batch 66 — Piece/Slab Hit-Test Geometry Extraction

## Scope

Batch 66 continues the drawing-engine migration by moving the remaining generic point/bounds calculations used by piece and slab hit testing onto the shared geometry layer.

## Ownership after this batch

- `src/geometry/hit-testing.ts` owns exact inclusive XYWH point containment and arbitrary-center point rotation.
- Piece domain geometry keeps piece pose, rotated-bounds placement, piece centers, and piece-local/world conversion because those encode CAD Lite piece semantics.
- `piece-canvas-model.ts` keeps projection, workspace behavior, paint-order hit priority, piece corner geometry, slab visibility, and entity selection.

## Behavior preserved

- Piece hit testing still searches reverse paint order.
- Piece broad-phase bounds remain exact and inclusive.
- Piece pointers are still inverse-rotated around the projected piece center before rounded-corner containment.
- Slab hit testing remains slab-workspace-only, reverse-ordered, visible-only, and exact-inclusive on slab bounds.
- No saved-schema, application-state, persistence, command, or production `main` changes are introduced.

## Validation

Focused geometry coverage extends `tests/hit-test-geometry.test.ts`; the architecture quality gate covers typecheck, lint, tests, build, and browser artifacts.

## Next seam

Inspect snapping and coordinate-conversion ownership for the next pure drawing-engine extraction, while retaining tool/session decisions in browser interaction code.
