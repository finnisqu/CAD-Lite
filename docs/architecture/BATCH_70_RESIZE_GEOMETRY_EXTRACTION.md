# Batch 70 — Resize Geometry Extraction

## Scope

Batch 70 continues the drawing-engine migration by extracting the browser-independent vector math used by piece resizing while preserving CAD-specific resize policy in the interaction layer.

## Ownership after this batch

- `src/geometry/vector.ts` owns projection of a world-space drag vector onto local axes and translation of a point along those axes.
- `src/app/interaction/pieces.ts` still owns resize-side direction/sign rules, locked sides, the 0.25-inch minimum dimension, 1/8-inch resize quantization, modifier behavior, object snapping, canvas bounds, preview/session state, and commands.
- The interaction layer determines local-axis offsets; geometry only performs the reusable vector operations.

## Behavior preserved

- Dragging right/left still changes width along the piece-local `u` axis.
- Dragging bottom/top still changes height along the piece-local `v` axis.
- Resizing from one side still shifts the piece center by half of the dimension change so the opposite edge remains fixed.
- Post-snap center recomputation uses the same side-specific offsets as the initial resize calculation instead of duplicating that math.
- Minimum dimensions, Shift/Alt behavior, piece snapping, rounding, bounds clamping, history, persistence, and saved schema are unchanged.
- Production `main` is untouched.

## Validation

Focused geometry coverage verifies projection onto rotated axes and translation along rotated axes. Architecture CI remains the full quality gate for typecheck, lint, tests, build, and browser-ready artifact verification.

## Next seam

Batch 71 should inspect the remaining interaction-only numeric constraints, especially pixel-to-world drag thresholds and resize increment quantization, and extract only the parts that are truly reusable geometry/core math while keeping tool-specific policy in the interaction layer.
