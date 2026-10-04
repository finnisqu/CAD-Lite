# Batch 69 — Rotation Angle Geometry Extraction

## Scope

Batch 69 continues the drawing-engine migration by extracting pure rotation-angle calculations from piece interaction into shared geometry while preserving the existing interaction policy exactly.

## Ownership after this batch

- `src/geometry/vector.ts` owns point-to-point angle calculation, signed angle-delta normalization, and generic angle-to-increment snapping.
- `src/app/interaction/pieces.ts` still owns rotate-session lifecycle, selected piece families, workspace rules, command/preview behavior, and the modifier-key policy that decides when angle snapping applies.
- Shift continues to force a 90-degree increment.
- Without Shift, rotation continues to softly snap to the nearest 90-degree increment only when within 5 degrees.
- Alt continues to bypass the soft snap.

## Behavior preserved

- Rotate-session start angles use the same `atan2` degree convention as before.
- Signed rotation deltas retain the existing `((value + 540) % 360) - 180` behavior.
- Forced and soft 90-degree snapping use the same nearest-increment rounding as before.
- Rotation group membership, centers, previews, history, persistence, and command semantics are unchanged.
- No saved-schema or production `main` changes are introduced.

## Validation

Focused geometry coverage now verifies cardinal point angles, signed angle-delta normalization, and increment snapping. Architecture CI continues to cover typecheck, lint, the full test suite, build, and browser-ready artifact verification.

## Next seam

Batch 70 should extract the pure resize pointer-projection and center-shift math from piece interaction while leaving resize-side policy, snapping targets, minimum dimensions, modifier behavior, and command/session ownership in the application layer.
