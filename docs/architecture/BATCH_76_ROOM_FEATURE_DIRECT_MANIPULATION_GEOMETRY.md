# Batch 76 — Room Feature Direct-Manipulation Geometry

## Scope

Batch 76 completes the consumer migration identified in Batch 75 by moving room-feature manipulation onto the shared geometry and viewport numeric foundations without changing room-feature policy or command ownership.

## Consumer migrations

`src/app/interaction/room-features.ts` now reuses:

- `constrainPointToAxes()` for Shift-forced and 3-degree weak wall straightening;
- `screenDistanceToWorld()` for the existing 8 px object-snap tolerance and 2 px short-wall / drag thresholds;
- `normalizeViewportScale()` for edit-session scale normalization;
- `distanceBetween()` for pointer movement gating;
- `pointAngleDegrees()` for wall and direct-rotation pointer angles;
- `snapAngleToIncrement()` for the existing 90-degree cardinal rotation target.

## Preserved application policy

The application layer still owns the actual values and decisions:

- 8 px room-feature snap tolerance;
- 2 px edit drag threshold;
- 2 px short-wall fallback threshold;
- 3-degree weak wall straightening;
- Shift-forced cardinal rotation;
- 5-degree soft cardinal rotation snap;
- Alt bypass for soft rotation snapping;
- 0.25 inch minimum room-feature size;
- room-feature resize side semantics;
- piece/grid/room-feature snap-target selection;
- preview serialization, commands, transactions, persistence, and saved project schema.

No controller hierarchy or new session abstraction is introduced.

## Regression coverage

The existing room-feature tool/edit suites continue to cover placement, Shift constraints, move/resize/rotate commit behavior, cancellation, and SLAB gating. Batch 76 adds a direct regression for the 5-degree soft cardinal rotation snap so both forced and soft cardinal policies are locked at the consumer boundary.

## Validation

The full architecture quality gate must pass: typecheck, lint, complete Vitest suite, production build, and browser-ready artifact verification.

## Next seam

With the main piece, annotation, and room-feature direct-manipulation math now consuming shared geometry, Batch 77 should audit the remaining bridge/legacy compatibility and browser-owned geometry paths for dead or duplicate calculations before the broader cutover hardening phase.
