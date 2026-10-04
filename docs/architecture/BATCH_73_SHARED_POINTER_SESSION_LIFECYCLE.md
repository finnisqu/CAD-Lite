# Batch 73 — Shared Pointer Session Lifecycle

## Scope

Batch 73 inspects interaction-session orchestration after the Batch 71–72 numeric cleanup and extracts only the pointer lifecycle behavior that is genuinely duplicated across controllers.

The batch deliberately does **not** introduce a base interaction controller or generic domain-session abstraction. Selection policy, preview shape, commit labels, commands, history boundaries, and tool-specific cancellation behavior remain owned by their existing controllers.

## Shared lifecycle primitives

`src/app/interaction/pointer-session.ts` now owns three small state helpers:

- `pointerSessionFromInput()` builds the canonical interaction pointer snapshot from a stable session start plus the latest pointer input.
- `interactionWithPointer()` updates pointer + preview state while preserving active tool, HUD, and tool memory.
- `clearPointerInteraction()` clears pointer + preview state and preserves every other interaction field.

These helpers are intentionally state-oriented rather than controller-oriented.

## Consumers migrated

### ToolController

The generic tool controller now uses `pointerSessionFromInput()` when it advances tool pointer state. Tool activation/deactivation policy, handler dispatch, parent-tool behavior, transactions, and cancel semantics are unchanged.

### AnnotationInteractionController

Annotation editing now uses the shared helpers when a pointer session begins, advances, completes, or cancels. Annotation snapping, endpoint constraints, label offsets, preview serialization, selection, commands, and transaction labels remain annotation-owned.

## Deferred consumers

`PieceInteractionController` and `RoomFeatureInteractionController` still contain equivalent pointer snapshot/cleanup code. They are intentionally left unchanged in this batch so the first lifecycle extraction can be validated on a smaller surface before migrating additional direct-manipulation controllers.

## Regression coverage

`tests/pointer-session.test.ts` verifies that:

- pointer snapshots preserve the original session start while tracking the latest input;
- pointer/preview updates preserve active tool, HUD, and tool memory state;
- cleanup clears pointer + preview only;
- cleanup is identity-preserving when the interaction is already clear.

Existing tool-controller and annotation-editing suites continue to protect behavior at the controller level.

## Validation

Architecture CI remains the completion gate: typecheck, lint, full Vitest suite, production build, and browser-ready artifact verification must all pass.

## Next seam

Batch 74 should migrate `PieceInteractionController` and `RoomFeatureInteractionController` onto these shared pointer lifecycle primitives, then reassess whether any further session infrastructure is genuinely duplicated. Do not introduce a controller hierarchy unless the post-migration source still demonstrates a concrete shared lifecycle beyond these state helpers.
