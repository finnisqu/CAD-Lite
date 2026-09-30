# Architecture Batch 6 — Selection and Tool Controller

Status: implementation checkpoint  
Behavior baseline: v1.5.99  
Branch: `architecture/v1.6-foundation`

## Purpose

Batch 6 formalizes two interaction systems that were previously spread across
many runtime flags and event handlers:

1. Selection
2. Canvas tools / modes

The production v1.5.99 runtime is still not switched over. This batch establishes
the architecture and executable behavior tests first.

## Selection

Selection is now controlled through one discriminated state value instead of a
collection of unrelated fields such as:

```text
selectedId
selectedIds
selectedDimId
selectedLineId
selectedNoteId
selectedRoomFeatureId
selectedAreaId
selectedLayoutId
selectedMaterialId
overlay selection
```

The Selection Controller supports:

- exclusive entity selection
- Piece multi-select
- additive Piece toggle
- Piece range selection in Layout order
- Select All Pieces
- stale-ID sanitation
- Area / Material / Layout / annotation / slab / Piece Group selection

A new selection always owns selection state. This encodes the existing
v1.5.99 precedence behavior without requiring every caller to clear every other
selection field manually.

## Workspace selection behavior

The v1.5.99 audit confirmed an intentional distinction:

- Piece selection survives DESIGN ↔ SLAB
- workspace-local selection does not

The architecture now encodes that directly in the workspace command.

## Interaction state

Session state now includes a typed InteractionState:

```text
interaction
  activeTool
  pointer
  preview
  hud
  toolMemory
```

None of this is written into the canonical project file.

### activeTool

Tracks:

- tool ID
- held vs locked activation
- held shortcut key
- selected/all scope where supported
- tool options

### pointer

Tracks one active canvas pointer gesture with start/current coordinates and
modifier keys.

### preview

Temporary tool geometry/data. Pointer-move previews update Session state only and
therefore never create history or autosave work.

### HUD

Stores shared movable HUD position independently of any specific tool.

### toolMemory

Allows per-tool transient controls to survive exit/re-entry while the application
is open.

## Tool registry

The initial registry formalizes:

- Splash
- Radius Labels
- Edge Painter
- Dimension
- Note
- Line
- SLAB Move
- Room Features
- Wall
- Linked Walls

Every tool declares:

- family
- title
- allowed workspace(s)
- momentary / locked capability
- keyboard shortcut where applicable
- optional parent tool
- optional default scope
- Enter-dismiss behavior

## Held vs locked behavior

A key v1.5.99 behavior is preserved:

> Starting a held shortcut takes ownership from the previous locked tool. Releasing
> the held key returns to neutral; it does not fall back to the old lock.

This behavior is now tested rather than being an incidental result of flag
mutation order.

HUD locking can promote a held tool to locked without losing its current scope.

## Scope

Splash, Radius Labels and Edge Painter begin each fresh session at:

```text
All Pieces
```

The HUD can narrow the active session to Selected.

Scope is now a property of the tool session rather than encoded by parallel tool
names such as `splash` / `splashAll`.

## Parent tool behavior

Room Features is modeled as a parent mode.

Wall and Linked Walls are children of Room Features. Cancelling a child returns
to Room Features instead of dropping directly to neutral, matching the current
HUD navigation behavior.

## Input routing

ToolController provides UI-independent routing for:

- key down
- key up
- pointer down
- pointer move
- pointer up
- Escape / Enter cancellation
- momentary shortcut release
- locked shortcut toggle

The controller does not depend on DOM events. Browser adapters will translate DOM
events into the small typed input structures.

## Tool handlers

Feature-specific geometry is not placed in ToolController.

A tool registers lifecycle hooks such as:

- onActivate
- onDeactivate
- onCancel
- onPointerDown
- onPointerMove
- onPointerUp

Handlers may return:

- a transient preview
- one or more domain commands
- a transaction label
- cancellation

When a pointer-up handler returns domain commands, those commands and interaction
cleanup are committed as one transaction. This is the foundation for one logical
Undo step after a drag/draw gesture.

## Shared HUD model

The HUD can derive a normalized model from the active tool:

- visibility
- title
- locked state
- lock capability
- scope
- parent-return behavior

Feature HUD controls remain tool-specific, but the shell/lifecycle is shared.

## Deliberate non-goals

Batch 6 does not yet:

- replace v1.5.99 DOM keyboard listeners
- replace current SVG pointer handlers
- move Piece geometry into TypeScript
- implement feature-specific Splash/Radius/Edge geometry handlers
- replace the current Mode HUD DOM
- replace current Room Feature rendering
- change production behavior

Those become incremental bridge migrations after the controller is proven.

## Acceptance criteria

Batch 6 is accepted when:

1. one logical Selection value replaces multi-field selection in the new architecture
2. Piece multi-select/range selection is deterministic
3. invalid selections sanitize safely
4. Piece selection survives workspace switching
5. workspace-local selection clears on workspace switching
6. only one tool owns canvas interaction at a time
7. held/locked behavior matches v1.5.99
8. scope is explicit and defaults correctly
9. Room Feature child tools return to their parent mode
10. pointer previews remain transient
11. pointer-up domain changes can commit as one transaction
12. keyboard routing is DOM-independent
13. HUD state is derived from the shared tool session
14. Architecture CI passes all checks
