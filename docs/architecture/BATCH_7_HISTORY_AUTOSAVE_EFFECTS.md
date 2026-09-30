# Architecture Batch 7 — History, Autosave, and Effects

Status: implementation checkpoint  
Behavior baseline: v1.5.99  
Branch: `architecture/v1.6-foundation`

## Purpose

Batch 7 makes the policies introduced in Batch 5 operational:

```text
history: record | skip
persistence: save | skip
```

Store commits now have central subscribers for:

- Undo / Redo history
- debounced autosave
- UI invalidation

Feature code no longer needs to decide independently when those systems should
run.

The production v1.5.99 runtime is still not switched over.

## v1.5.99 behaviors retained

The audit confirmed these current limits:

- history stack limit: 50 snapshots
- autosave debounce: 400 ms
- large autosave warning threshold: approximately 4.5 million serialized characters

Those defaults are retained.

## History semantics

History is seeded from the hydrated application state and records only commits
whose metadata says:

```text
history: record
```

A transaction creates one history entry because the Store emits one transaction
commit.

Undo / Redo restoration deliberately restores:

- Project state
- workspace when that workspace transition was recorded

It deliberately does not rewind state whose commands are marked out of history:

- editor preferences
- ordinary active Layout switching
- transient interaction state

This avoids a weakness of broad snapshot systems where a non-undoable preference
or navigation change can be accidentally reverted by an unrelated later Undo.

### Selection preservation

The v1.5.99 selection rule is retained:

1. Preserve the user's current selection if the selected entity still exists.
2. If it no longer exists after Undo/Redo, use the target history entry's
   selection as a safe fallback.
3. If neither is valid, clear selection.

Piece selection can therefore survive ordinary Undo/Redo, while Undoing an
operation that removes the selected Piece can return to a previously valid
selection.

### Navigation preservation

Active Layout is navigation state, not an Undo step.

When applying history:

- keep the current Layout when it still exists
- otherwise fall back to the historical Layout
- otherwise use the first available Layout

If history changes workspace or forces a Layout fallback, the active gesture is
cleared while HUD position and per-tool memory are retained.

### Branching history

After Undo, a new undoable command truncates the Redo branch.

## Autosave

Autosave is now a Store subscriber.

Only commits marked:

```text
persistence: save
```

schedule a write.

Transient commands such as selection, pointer previews, HUD movement, and tool
activation do not touch the autosave timer.

The default debounce is 400 ms. Repeated durable changes collapse into one
write.

Autosave writes the canonical versioned `CadLiteFile` format rather than a
second application-specific object shape.

Selection, pointer state, previews, active tools, HUD position, and other
transient Session state are therefore excluded automatically.

### Storage abstraction

The autosave layer depends on a tiny storage interface rather than directly on
`window.localStorage`.

The browser runtime can pass `window.localStorage`, while tests or future
desktop/cloud adapters can provide another implementation.

### Failure handling

Storage failures are captured as Autosave status instead of throwing through an
editing command.

The UI can subscribe to:

```text
idle
pending
saved
error
```

and surface failures without coupling persistence to `alert()`.

A synchronous `flush()` exists for before-unload integration.

Undo and Redo are persisted but explicitly skip history recording, so an Undo
does not create another Undo entry.

## UI invalidation

A new ViewInvalidationCoordinator converts Store changes into view targets:

```text
canvas
navigator
inspector
toolbar
hud
```

It distinguishes:

- Project changes
- preference changes
- Layout/workspace context changes
- selection changes
- tool/interaction changes
- other transient Session changes

Synchronous Store commits are coalesced into one scheduled invalidation batch.

This is the replacement path for scattered calls such as:

```text
draw()
renderList()
renderDimList()
renderNoteList()
updateInspector()
syncTopBar()
syncModeHUD()
...
```

The coordinator only says which projections are stale. Actual DOM/SVG renderers
remain feature/workspace adapters and will be migrated later.

## ApplicationEffects

`ApplicationEffects` wires the three central subscribers in one place:

```text
Store
  ├── HistoryManager
  ├── AutosaveManager
  └── ViewInvalidationCoordinator
```

Registration order ensures History state is current before a coalesced UI
invalidation is delivered.

## Deliberate non-goals

Batch 7 does not yet:

- replace v1.5.99 Undo/Redo buttons
- replace the existing `localStorage` runtime
- replace current render functions
- detach share-link IDs
- migrate current Piece drag handlers
- move fabrication geometry into the command layer
- change production behavior

Those become bridge/runtime migrations after the foundation services are proven.

## Acceptance criteria

Batch 7 is accepted when:

1. history is driven only by Store commit metadata
2. transactions create one history entry
3. history is capped at the v1.5.99 limit
4. Undo/Redo restores project/workspace state without rewinding skip-history state
5. valid current selection survives history traversal
6. invalid current selection safely falls back
7. new edits after Undo truncate Redo
8. autosave is driven only by persistence metadata
9. autosave uses the v1.5.99 400 ms debounce
10. transient interaction does not reset the autosave timer
11. autosave writes canonical versioned project files
12. autosave failures are observable without throwing through commands
13. Undo/Redo schedules persistence without recording new history
14. UI invalidations are derived centrally from Store changes
15. synchronous invalidations coalesce
16. architecture CI passes all checks
