# Architecture Batch 8 — Browser Runtime and First Vertical Slice

Status: implementation checkpoint  
Behavior baseline: v1.5.99  
Branch: `architecture/v1.6-foundation`

## Purpose

Batch 8 stops adding isolated infrastructure and proves the architecture through
a real browser-facing workflow.

The first vertical slice is intentionally low risk:

- Project Name
- Project Date
- Project Notes
- Layout selection/switching
- Layout inline rename
- Layout Inspector rename
- Layout quantity
- Undo / Redo controls
- autosave status

No Piece geometry is migrated in this batch.

## Real v1.5.99 behavior audit

The browser wiring was checked against the current v1.5.99 handlers.

### Project metadata

Current behavior:

- Project Name updates on input
- Project Notes update on input
- Project Date updates on change
- all three autosave
- none explicitly call `pushHistory()`

The architecture command now matches that contract:

```text
project.setMeta
  history: skip
  persistence: save
```

### Layout operations

Current behavior:

```text
Layout rename
  history: record
  persistence: save

Layout quantity
  history: record
  persistence: save

Layout switch
  history: skip
  persistence: save
```

Those policies are retained.

## History-boundary refinement

Batch 7 correctly separated many Session/Preference values from Undo, but the
Batch 8 audit exposed one remaining whole-Project issue.

If Project metadata is non-undoable, storing the entire Project in every history
snapshot could still rewind Project Name/Date/Notes during an unrelated later
Layout Undo.

History snapshots now explicitly contain:

- Materials
- Layouts
- undoable workspace
- navigation fallback
- selection fallback

They do not contain Project metadata.

Undo/Redo reconstructs the Project using current metadata plus the historical
Materials/Layouts.

This means the browser slice can preserve the actual v1.5.99 behavior without
weakening the command policy model.

## Browser runtime

`mountCadLiteBrowserRuntime()` now composes the browser application shell:

```text
initial legacy/canonical payload
        ↓
migration / normalization
        ↓
AppStore
        ↓
CommandDispatcher
        ↓
SelectionController
ToolController
ApplicationEffects
        ↓
ProjectLayoutSurface
```

The runtime also flushes canonical autosave synchronously on browser
`beforeunload`, matching the safety intent of v1.5.99.

The runtime accepts a storage adapter, so browser `localStorage` remains a
boundary rather than a dependency inside commands/domain code.

## DOM compatibility surface

The first browser surface intentionally uses existing CAD Lite element IDs:

- `lc-project`
- `lc-date`
- `lc-notes`
- `lc-layouts`
- `lc-inspector`
- `lc-undo`
- `lc-redo`

An optional `lc-save-status` element displays:

- Saving…
- Saved
- Save failed

The Layout renderer also reuses current class names such as:

- `lc-layout-item`
- `lc-layout-title-row`
- `lc-layout-title`
- `lc-layout-qty-text`
- `lc-layout-actions`
- `lc-rename-btn`

This is deliberate groundwork for the eventual production bridge.

## Rendering path

The surface does not subscribe directly to every Store commit.

It consumes the central Batch 7 invalidation coordinator:

```text
Store Commit
   ↓
ViewInvalidationCoordinator
   ↓
ProjectLayoutSurface
   ├── Navigator refresh
   ├── Inspector refresh
   └── toolbar/history refresh
```

History and Autosave status have their own service subscriptions because their
status can change without a new domain commit.

## Input behavior

Project text inputs dispatch commands directly.

Active text controls are not overwritten during invalidation renders, avoiding
caret jumps while typing.

Layout inline rename retains the current interaction:

- Rename button enters inline text editing
- Enter saves
- Escape cancels
- blur saves

Clicking or keyboard-activating a Layout uses the central navigation command and
selects that Layout for the Inspector.

The first Layout Inspector exposes Name and Quantity through the command system.

## Development harness

The Vite `dev/` page now runs the real browser runtime instead of displaying
build metadata only.

It intentionally provides a small Project / Layout / Inspector shell so the
vertical slice can be exercised manually without loading the v1.5.99 monolith.

Harness-only CSS is scoped under:

```text
.cad-lite-architecture-harness
```

and is not a redesign of production CAD Lite.

## Deliberate non-goals

Batch 8 does not yet:

- replace the production v1.5.99 runtime
- migrate Add/Duplicate/Delete/Reorder Layout
- migrate Areas
- migrate Material UI
- migrate Piece rendering or Piece mutation
- connect the production SVG canvas
- replace the full Inspector
- replace the production Navigator wholesale

The point is to prove one contained feature slice end to end.

## Acceptance criteria

Batch 8 is accepted when:

1. Project metadata uses browser DOM → command → Store → autosave
2. Project metadata remains outside Undo
3. later Undo operations do not accidentally rewind Project metadata
4. Layout rename uses browser DOM → command → Store → history/autosave
5. Layout quantity uses the same path
6. Layout switching remains non-undoable but persisted
7. Undo/Redo buttons are driven by HistoryManager status
8. browser rendering is driven through central invalidation
9. autosave status can be rendered without persistence knowing DOM
10. v1.5.99 DOM IDs/classes are reused where practical
11. the Vite development harness runs the real browser runtime
12. architecture CI passes all checks
