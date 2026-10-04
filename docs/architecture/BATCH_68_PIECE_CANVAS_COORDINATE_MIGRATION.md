# Batch 68 — Piece Canvas Coordinate Migration

## Scope

Batch 68 completes the first consumer migration enabled by Batch 67 by routing the main Piece Canvas pointer-input path through the shared viewport coordinate projection helper.

## Ownership after this batch

- `src/geometry/viewport.ts` remains the owner of client-rectangle to viewport-coordinate projection math.
- `PieceCanvasSurface` still owns DOM measurement, pointer events, pointer capture, modifier keys, and construction of `ToolPointerInput`.
- Piece, annotation, room-feature, and tool interaction controllers continue to receive canvas/world coordinates and remain browser-independent.
- Floor-plan calibration and the main Piece Canvas now share the same coordinate-projection primitive instead of maintaining parallel formulas.

## Behavior preserved

- Piece Canvas pointer coordinates still map the SVG client rectangle into the full CAD canvas at origin `(0, 0)`.
- Zero or negative rendered dimensions still reject pointer conversion through the shared helper.
- Pointer button state and Shift/Alt/Ctrl/Meta modifiers are unchanged.
- Selection, hit-testing, snapping, pointer capture, tools, and command behavior are unchanged.
- No saved-schema, persistence, or production `main` changes are introduced.

## Interaction math review

The remaining coordinate/constraint math in `src/app/interaction/pieces.ts` was reviewed but intentionally left in place for this batch because it combines a different migration seam with interaction policy. The clearest next pure-geometry candidates are:

1. rotation angle calculation and signed-angle normalization,
2. generic angle-to-increment snapping while leaving the Shift/Alt policy in the interaction layer,
3. resize pointer projection onto local piece axes and center-shift calculations,
4. pixel-to-world drag threshold conversion where it can be shared without obscuring tool-specific thresholds.

Smart-snap target discovery, workspace rules, preferences, entity priorities, and session lifecycle remain application-interaction concerns rather than geometry concerns.

## Validation

Architecture CI should continue to cover typecheck, lint, tests, build, and browser-ready artifacts. Existing viewport geometry tests cover the shared coordinate projection primitive; this batch changes its main browser consumer without changing the primitive contract.

## Next seam

Batch 69 should extract rotation angle primitives from piece interaction into the geometry layer, then use them from the rotate session while preserving the existing 90° forced snap and 5° soft-snap policy exactly.
