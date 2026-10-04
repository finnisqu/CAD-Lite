# Batch 64 — Viewport Geometry Extraction

## Scope

Batch 64 begins the drawing-engine extraction by moving production viewport math out of the browser surface and into the pure geometry layer.

## Ownership after this batch

- `src/geometry/viewport.ts` owns pure viewport scale stepping and pointer-anchored scroll calculations.
- Application command invariants continue to own the allowed canvas scale range.
- `ProductionViewportSurface` remains the browser adapter for DOM events, theme/focus modes, wheel-session coalescing, command dispatch, history, persistence, and scroll writes.
- Thin production helper wrappers remain exported for compatibility, but delegate their calculations to geometry.

## Behavior preserved

- Production zoom remains a `0.5 px/in` step.
- Production scale remains clamped to the existing `1–24 px/in` range.
- Ctrl/Cmd + wheel zoom keeps the same world coordinate beneath the pointer.
- Wheel preview ticks still coalesce into one durable undoable zoom command.
- No saved-schema, state-shape, persistence, or production `main` changes are introduced.

## Validation

The geometry helpers have focused unit coverage in `tests/viewport-geometry.test.ts`; existing production viewport tests continue to cover the browser adapter and history behavior.

## Next seam

Continue source-guided drawing-engine extraction with the next browser-owned pure coordinate, snapping, bounds, or hit-test calculation that can move without changing interaction ownership.
