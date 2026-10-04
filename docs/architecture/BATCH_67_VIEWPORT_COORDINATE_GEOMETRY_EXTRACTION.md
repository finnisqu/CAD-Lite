# Batch 67 — Viewport Coordinate Geometry Extraction

## Scope

Batch 67 continues the drawing-engine migration by extracting browser-independent client-to-viewport coordinate projection into the shared geometry layer and reviewing snapping ownership before moving any additional interaction code.

## Ownership after this batch

- `src/geometry/viewport.ts` owns numeric client-rectangle to viewport-coordinate projection.
- Browser surfaces still own DOM measurement, pointer events, pointer capture, modifier keys, and interaction lifecycle.
- Floor-plan calibration keeps calibration modes, drag state, keyboard behavior, and command dispatch; it now delegates only coordinate projection math.
- Pure smart-snapping math remains in `src/geometry/snapping.ts`.
- `src/app/interaction/pieces.ts` remains responsible for CAD Lite-specific snap target discovery, preferences, workspace rules, entity priority, and interaction/session decisions.

## Behavior preserved

- Client coordinates are projected with the same linear mapping previously used by floor-plan calibration.
- Nonzero SVG viewBox origins remain supported.
- Zero or negative rendered client dimensions still reject pointer conversion.
- Pointer positions are not clamped by the shared projection helper.
- No saved-schema, persistence, command semantics, or production `main` behavior changes are introduced.

## Validation

Focused viewport coverage verifies client-to-viewport projection, nonzero viewport origins, and invalid client dimensions. Architecture CI continues to cover typecheck, lint, tests, build, and browser-ready artifacts.

## Next seam

Migrate the main piece-canvas pointer input path onto the shared coordinate projection helper, then inspect the remaining interaction-session coordinate/constraint math for the next drawing-engine extraction.
