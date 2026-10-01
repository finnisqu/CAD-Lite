# Batch 35 — Add Piece Keyboard Parity

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: `28fed3fb7ee13d924a5e235f1a91ade87a5c28cf`

## Scope

Batch 35 restores the production `P` shortcut for adding a Piece while preserving the typed Piece command path and runtime ID ownership.

This is a narrow acceptance-parity batch. It does not introduce a second Piece creation path or change Piece defaults.

## Production behavior restored

Outside editable targets and without Ctrl/Cmd or Alt:

- `P` adds a Piece to the active Layout in DESIGN
- shortcut matching is case-insensitive
- SLAB does not create a Piece from `P`
- editable inputs, textareas, selects, and contenteditable surfaces retain normal typing behavior

Tool-specific keyboard handling still gets first opportunity to consume a key before the global canvas keyboard surface.

## Architecture

`CanvasKeyboardSurface` now owns the global Add Piece shortcut alongside the other non-tool canvas shortcuts.

The surface receives a `createPieceId()` dependency from the browser runtime. The runtime continues to own the authoritative ID factory and the shortcut executes the existing typed `addPiece(...)` command.

No DOM button click is synthesized, and no Piece mutation is performed directly in the keyboard adapter.

A small pure `canvasAddPieceShortcut()` mapper owns case-insensitive `P` recognition for DOM-free regression coverage.

## Tests

Batch 35 adds regression coverage for:

- lowercase `p`
- uppercase `P`
- unrelated editor keys remaining unclaimed by the Add Piece mapper

Final Batch 35 CI at architecture head `c86df0b907e494b703f95b055a618464e7dbda45`:

- Architecture CI run: `36880792465`
- TypeScript / ESLint / tests / build: pass
- Browser artifact verification: pass

Production `main` remains frozen at `77728eed327f144b0b1c5d4b9562747d8d62074e`.

## Deliberate boundary

Batch 35 does not change:

- Piece default geometry or placement
- active Area assignment behavior
- Add Piece toolbar/button behavior
- Piece selection after creation
- SLAB placement behavior
- tool shortcuts or momentary/locked tool semantics

## Next batch

Continue the acceptance audit against frozen v1.5.99. Prefer another explicit interaction or View/Edit parity gap that can reuse the typed command/store/tool infrastructure rather than adding feature scope.
