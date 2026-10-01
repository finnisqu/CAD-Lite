# Batch 24 — Room Feature / Wall interactions

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: 9ef6d64eac102cadd9c880f292936991147f72a4

## Scope

Batch 24 connects the typed Room Feature / Wall domain from Batch 23 to the shared
ToolController and direct canvas interaction lifecycle.

The batch covers:

- Q Room Features parent mode
- full-wall child tool
- W linked-wall child tool
- placement previews
- object/grid snapping
- Alt snap bypass
- weak 3° H/V wall inference
- Shift strong H/V wall constraint
- direct move
- side resize
- rotate
- transient guides / snap marker
- preview → commit transactions
- DESIGN-only guards

## Tool lifecycle

Room Features use the existing shared ToolController; no parallel mode system was
introduced.

### Q — Room Features parent

Q toggles the locked `roomFeatures` parent mode.

Pointer placement in the parent mode creates a default base Room Feature. The parent
remains active after placement so repeated features can be placed without repeatedly
re-entering the mode.

### Full Wall child

`roomWall` is a locked child of Room Features. Its cancel/Escape behavior returns to
the Q parent instead of leaving the entire Room Features family.

### W — Linked Wall child

W activates the existing momentary `linkedWall` child tool. Releasing W returns to
the locked Room Features parent. Shift+W remains the controller's lock toggle for the
linked-wall child.

Batch 24 deliberately treats `wallType: linked` as the typed interaction semantic.
It does not invent a new cross-entity relationship graph that does not yet exist in
the canonical Room Feature schema. Authoritative linked-wall propagation can be
added later once the legacy relationship fields are explicitly migrated.

## Placement geometry

Base placement creates the established default architecture feature size of 36 × 24.

Wall placement is directional:

1. pointer-down establishes the start point
2. pointer-move resolves the endpoint
3. the preview derives physical length and rotation
4. pointer-up commits one `addRoomFeature()` command

A click without a meaningful wall drag falls back to a 96-inch horizontal wall.

## Snapping

Room Feature placement and editing share one resolver.

Priority is:

1. existing Piece bounds/centers when Piece Snap is enabled
2. existing Room Feature bounds/centers
3. grid fallback when Grid Snap is enabled
4. raw pointer position

Alt bypasses snap resolution.

Directional walls preserve the CAD Lite straightening behavior already established
for annotations:

- normal movement receives weak 3° horizontal/vertical inference
- Shift forces horizontal/vertical constraint

## Direct editing

`RoomFeatureInteractionController` owns manipulation of persisted Room Features.

### Move

Dragging an existing Room Feature preserves the pointer offset and resolves the new
anchor through the same snap resolver.

### Resize

Selected Room Features expose top/right/bottom/left resize semantics. Resize math is
performed in the Room Feature's rotated local coordinate system so the opposite side
remains fixed while the selected side moves.

### Rotate

Rotation is around the Room Feature center.

- Shift snaps strongly to 90-degree cardinal angles
- normal movement receives a weak 5-degree cardinal snap
- Alt bypasses weak rotation snapping

## Preview → commit

Placement and editing never mutate persisted Layout geometry on pointer-move.

Editing writes only a transient `room-feature-edit` preview to Session interaction
state. Canvas projection merges that preview for rendering. Pointer-up commits one
typed `updateRoomFeature()` command plus interaction cleanup as one transaction.

This preserves:

**one gesture → one command transaction → one Undo step → one autosave**

Cancel/pointer-cancel discards the preview with no Layout mutation.

## Canvas interaction overlay

Room Feature handles and interaction guides live in a dedicated browser adapter:

`src/browser/room-feature-canvas-interactions.ts`

This avoids adding another feature-specific branch to the already-large Piece canvas
class. The adapter:

- preserves Piece and annotation hit-test precedence
- owns Room Feature pointer capture
- draws selected resize handles
- draws a rotate handle
- draws transient alignment guides
- draws a snap marker / preview outline
- delegates all mutation to the Room Feature interaction controller

The normal Room Feature renderer remains read-only.

## Tests

Batch 24 adds coverage for:

- Q parent activation and repeated base placement
- W momentary linked-wall child behavior
- return to Q parent on W release
- full-wall child placement
- Shift wall constraint
- SLAB tool guards
- move preview without domain mutation
- move commit
- side resize with opposite-side preservation
- Shift rotation snap
- cancel with no persisted mutation

## Deliberate boundary

Still deferred:

- authoritative linked-wall relationship propagation between entities
- legacy cabinet-run generation/editing workflow
- countertop generation directly from receiving Room Features
- specialized appliance/cabinet glyph interactions
- multi-select Room Features
- Room Feature keyboard nudging / duplication

Those behaviors can now be added on top of the same typed command and interaction
boundary rather than through ad-hoc DOM mutation.

## Next batch

The next coherent migration slice is **Batch 25 — Floor Plan context**: typed floor
plan/underlay ownership, visibility/opacity/transform, preparation/erase behavior,
and Inspector/Navigator integration before the final parity and cleanup passes.
