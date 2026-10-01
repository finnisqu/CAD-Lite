# Batch 34 — Global Undo / Redo Keyboard Parity

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: `bd246b80c4770f48905271c47514f40e1876cdc5`

## Scope

Batch 34 restores the v1.5.99 global editor history shortcuts by connecting the browser keyboard layer to the existing typed `HistoryManager`.

No new history stack or snapshot format is introduced.

## Production shortcuts restored

Outside typing/editable targets and without Alt:

- Ctrl/Cmd+Z → Undo
- Ctrl/Cmd+Y → Redo
- Ctrl/Cmd+Shift+Z → Redo

The shortcut parser is case-insensitive.

As in v1.5.99, a recognized Undo/Redo shortcut suppresses the browser default even when CAD Lite currently cannot move farther through its own history stack.

## Architecture

`CanvasKeyboardSurface` now receives the authoritative `HistoryManager` owned by `ApplicationEffects`.

The browser runtime passes `effects.history` directly into that surface.

This preserves the existing architecture:

- commands/transactions mark changes as record/skip
- `HistoryManager` owns snapshots, stack branching, bounds, labels, restore behavior, and persistence
- the browser keyboard surface only maps keystrokes to `history.undo()` / `history.redo()`

A small pure `canvasHistoryShortcut()` mapper owns shortcut recognition so the mapping can be tested without a DOM environment.

## Tests

Batch 34 adds regression coverage for:

- Ctrl/Cmd+Z Undo mapping
- uppercase/case-insensitive Undo mapping
- Ctrl/Cmd+Y Redo mapping
- Ctrl/Cmd+Shift+Z Redo mapping
- unrelated command keys remaining available to clipboard/duplicate handling

Existing HistoryManager tests continue to cover the history engine itself.

Final Batch 34 CI at architecture head `854f829b426a0bfdc02de8b72fd836c94b500958`:

- Architecture CI run: `36878344617`
- TypeScript: pass
- ESLint: pass
- Tests: **309/309** across **40 files**
- Build: pass
- Browser artifact verification: pass
- JS: **349.01 kB / 87.19 kB gzip**
- CSS: **25.05 kB / 4.42 kB gzip**

Production `main` remains frozen at `77728eed327f144b0b1c5d4b9562747d8d62074e`.

## Deliberate boundary

Batch 34 does not change:

- history snapshot contents
- history depth
- transaction coalescing
- which commands are record vs. skip
- image-editor-local Undo/Redo
- toolbar/menu Undo/Redo presentation

Any remaining differences in those areas should be measured separately against v1.5.99 before changing them.

## Next batch

Continue the acceptance audit against the frozen v1.5.99 bundle. Prefer the next explicit interaction or View/Edit parity gap rather than expanding feature scope.
