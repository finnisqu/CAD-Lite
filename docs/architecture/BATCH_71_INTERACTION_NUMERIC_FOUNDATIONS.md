# Batch 71 — Interaction Numeric Foundations

## Scope

Batch 71 inspects the remaining numeric calculations around piece interactions and extracts only the browser-independent math that is genuinely reusable before moving more CAD policy out of the interaction controller.

## Ownership after this batch

- `src/core/numeric.ts` owns generic quantization to a caller-provided numeric increment.
- `src/geometry/viewport.ts` owns normalization of viewport scale and conversion of screen-space distances into world-space distances.
- `src/geometry/vector.ts` keeps the angle-specific `snapAngleToIncrement` API, but delegates its generic rounding math to core numeric.
- `src/app/interaction/pieces.ts` continues to own CAD-specific policy values and behavior, including the 2 px SLAB drag threshold, 4 px default drag threshold, 0.25-inch minimum piece dimension, 1/8-inch friendly resize increment, modifier behavior, snapping policy, sessions, previews, and commands.

## Behavior preserved

- Angle snapping uses the same nearest-increment rounding semantics as before.
- Viewport zoom anchoring still converts screen coordinates through the same safe positive scale with the same 0.001 floor and fallback-to-1 behavior.
- No piece interaction thresholds, resize increments, minimum sizes, modifiers, snapping behavior, history behavior, persistence behavior, or saved schema are changed in this batch.
- Production `main` is untouched.

## Validation

- Numeric coverage verifies eighth-inch, half-unit, negative-increment, zero-increment, and non-finite-increment quantization semantics.
- Viewport geometry coverage verifies positive, negative, tiny, zero, and non-finite scale normalization plus screen-to-world distance conversion.
- Existing geometry coverage continues to protect angle snapping behavior through the public `snapAngleToIncrement` API.
- Architecture CI remains the full quality gate for typecheck, lint, tests, build, and browser-ready artifact verification.

## Next seam

Batch 72 should migrate `PieceInteractionController` to these shared primitives, replace its repeated scale normalization and raw `Math.hypot` threshold calculations, and name the existing CAD policy constants without changing the 2 px / 4 px drag thresholds, 0.25-inch minimum, or 1/8-inch resize behavior.
