# Batch 75 — Annotation Direct-Manipulation Geometry

## Scope

Batch 75 centralizes the reusable numeric and constraint math still duplicated across annotation creation/editing, while keeping annotation-specific snap-target selection and command/history policy in the application layer.

The room-feature direct-manipulation audit was completed in this batch, but its larger consumer rewrite is intentionally deferred so this batch stays small and fully reviewable.

## Shared orthogonal constraint

`src/geometry/constraints.ts` now exposes `constrainPointToAxes()`, a pure helper that returns both the constrained point and whether the result is horizontal or vertical.

Existing `constrainDrawPoint()` now delegates to the shared primitive while preserving its v1.5.99 near-zero behavior.

Annotation creation/editing now consumes the shared helper instead of maintaining its own Shift-forced and 3-degree weak straightening math.

## Viewport numeric migration

Annotation snapping/edit sessions now reuse the viewport and distance foundations established in Batches 64–72:

- `screenDistanceToWorld()` for the 8 px piece-snap tolerance and 6 px annotation-axis tolerance;
- `normalizeViewportScale()` for interaction session scale normalization;
- `distanceBetween()` plus `screenDistanceToWorld()` for the existing 2 px drag threshold.

The numeric policy values themselves remain application-owned.

## Preserved application policy

This batch does not change:

- piece/grid/annotation snap target selection;
- Alt bypass behavior;
- Shift constraint behavior;
- 3-degree weak straightening;
- annotation preview formats;
- selection semantics;
- command construction;
- history or persistence behavior;
- saved project schema.

## Regression coverage

`tests/geometry.test.ts` now covers forced orthogonal constraints, default weak constraints, configurable weak-angle constraints, and legacy `constrainDrawPoint()` behavior. Existing annotation interaction/editing suites continue to provide end-to-end consumer coverage.

## Room-feature audit result

The room-feature controller still contains the same reusable patterns already available in geometry: orthogonal wall constraints, viewport-scale tolerance conversion, pointer-distance drag gating, and cardinal angle snapping. Those are suitable consumer migrations, but the room-feature file is large enough that they should land as a separate small batch rather than be bundled into this annotation change.

## Next seam

Batch 76 should migrate the room-feature direct-manipulation consumers onto the same shared geometry/numeric primitives, preserving its 8 px snap tolerance, 2 px drag threshold, 3-degree weak straightening, Shift-forced 90-degree snap, 5-degree soft snap, resize rules, command/history boundaries, and persistence behavior exactly.
