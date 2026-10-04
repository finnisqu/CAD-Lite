# Batch 72 — Piece Interaction Numeric Consumer Migration

## Scope

Batch 72 completes the consumer side of the numeric foundations introduced in Batch 71. The piece interaction controller now consumes shared scale, screen-distance, geometric-distance, and increment-quantization primitives while preserving the production interaction rules exactly.

## Ownership after this batch

- `src/core/numeric.ts` owns generic increment quantization.
- `src/geometry/viewport.ts` owns viewport scale normalization and screen-space to world-space distance conversion.
- `src/geometry/vector.ts` owns point/vector geometry, including point-to-point distance.
- `src/app/interaction/pieces.ts` owns CAD interaction policy and session behavior.

The application layer therefore still decides the actual policy values and when they apply; it no longer reimplements the underlying numeric formulas.

## Named CAD policy retained

- Default pointer drag threshold: 4 screen pixels.
- SLAB piece-move drag threshold: 2 screen pixels.
- Minimum piece dimension during resize: 0.25 inches.
- Friendly resize increment: 0.125 inches (1/8 inch).

Shift/Alt behavior, object/grid snapping, resize-side semantics, click-vs-drag selection behavior, history transactions, persistence, and saved schema remain unchanged.

## Consumer migration

- Move, resize, rotate, and blank pointer sessions use `normalizeViewportScale()` instead of repeating inline scale coercion.
- Pointer move/up drag gating uses `distanceBetween()` and `screenDistanceToWorld()` instead of inline `Math.hypot` and pixel/scale division.
- Friendly resize quantization uses `quantizeToIncrement()` instead of inline multiply/round/divide math.
- Existing minimum-dimension clamps use a named application-layer policy constant.

## Regression coverage

A focused piece-interaction threshold test locks the exact scale-8 boundaries:

- DESIGN: 0.5 world units (4 px) is still a click; movement beyond it becomes a drag.
- SLAB: 0.25 world units (2 px) is still a click; movement beyond it becomes a drag.

Existing piece-interaction tests continue to protect 1/8-inch resize quantization, snapping, history, and workspace behavior.

## Validation

Architecture CI is the completion gate: typecheck, lint, full Vitest suite, production build, and browser-ready artifact verification must all pass.

## Next seam

Batch 73 should inspect interaction-session orchestration now that its numeric math is thin. The next extraction should target shared pointer/session lifecycle behavior only where multiple controllers genuinely duplicate it; CAD-specific selection, tool policy, and commands should remain application-owned.
