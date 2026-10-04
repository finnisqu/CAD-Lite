# Batch 65 — Canvas Hit-Test Geometry Extraction

## Scope

Batch 65 continues the drawing-engine migration by moving reusable hit-test and rotated-coordinate calculations out of browser canvas models and into the pure geometry layer.

## Ownership after this batch

- `src/geometry/hit-testing.ts` owns point-to-segment distance, point rotation around a center, and rotated-rectangle axis-aligned bounds.
- Annotation canvas code retains annotation projection, screen-sized hit tolerances, entity priority, and selection semantics.
- Room-feature canvas code retains projection, visibility rules, preview handling, reverse paint-order hit priority, and entity selection semantics.
- Existing rectangle/vector primitives remain the lower-level implementation building blocks used by the new hit-test helpers.

## Behavior preserved

- Notes are still hit-tested before lines and dimensions.
- Annotation line tolerance remains screen-sized and scale-aware.
- Room-feature bounds are still computed around the feature center using its length, depth, and rotation.
- Room-feature hit testing still inverse-rotates the pointer into the feature's local rectangle and ignores preview-only items.
- No saved-schema, application-state, persistence, command, or production `main` changes are introduced.

## Validation

Focused geometry coverage lives in `tests/hit-test-geometry.test.ts`. Existing annotation canvas coverage continues to verify browser-level hit priority and tolerance behavior; the full architecture quality gate covers typecheck, lint, tests, build, and browser artifacts.

## Next seam

Continue source-guided drawing-engine extraction by migrating the remaining piece/slab local-coordinate and bounds hit-test calculations onto the shared geometry primitives, then inspect snapping/coordinate conversion for the next pure seam.
