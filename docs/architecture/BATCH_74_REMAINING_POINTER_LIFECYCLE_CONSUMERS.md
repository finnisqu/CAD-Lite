# Batch 74 — Remaining Pointer Lifecycle Consumers

## Scope

Batch 74 completes the consumer migration started in Batch 73. `PieceInteractionController` and `RoomFeatureInteractionController` now delegate their duplicated pointer snapshot and pointer/preview cleanup state transitions to the shared lifecycle primitives in `src/app/interaction/pointer-session.ts`.

The batch is intentionally narrow. It does not change selection policy, snapping, drag thresholds, preview formats, domain commands, history boundaries, persistence, or saved project schema.

## Piece interaction migration

`PieceInteractionController` keeps its existing local `pointerState()` and `clearPointerState()` adapters so the controller call sites remain stable, but those adapters no longer construct or clear interaction state themselves. They delegate to:

- `interactionWithPointer()` for pointer snapshots plus serialized preview state;
- `clearPointerInteraction()` for pointer/preview cleanup.

Piece-specific move/resize/rotate/blank behavior, selection drill-in, nudge transactions, DESIGN/SLAB policies, and commit labels remain application-owned.

## Room-feature interaction migration

`RoomFeatureInteractionController` keeps its small command-producing adapters, but their state transformations now delegate to the same shared lifecycle helpers. Room-feature move/resize/rotate previews, snapping, tool placement, commit labels, selection, and update commands remain room-feature-owned.

## Architecture reassessment

After migrating ToolController, annotation editing, pieces, and room features, there is no remaining source evidence for a controller hierarchy or generic interaction engine. The common lifecycle is now limited to small state transforms, and those transforms are centralized.

The controllers still differ materially in:

- session validity rules;
- preview models and serialization;
- click-vs-drag policy;
- selection semantics;
- domain command construction;
- transaction/history behavior;
- tool activation and cancellation semantics.

Those differences are healthy application-layer ownership and should not be abstracted merely for structural symmetry.

## Regression coverage

Batch 73's focused `pointer-session.test.ts` continues to lock the shared state-helper contract. Existing piece-interaction, piece-interaction-parity, piece-interaction-threshold, room-feature-interaction, annotation-editing, and tool-controller suites validate the migrated consumers end-to-end.

## Validation

The full architecture quality gate must pass: typecheck, lint, complete Vitest suite, production build, and browser-ready artifact verification.

## Next seam

With pointer lifecycle centralized, Batch 75 should move out of controller-lifecycle extraction. The next source-grounded pass should inspect the remaining direct-manipulation numeric/constraint duplication in annotation and room-feature interactions and either migrate it onto the geometry/numeric foundations already established in Batches 64–72 or explicitly leave domain-specific policy in place.
