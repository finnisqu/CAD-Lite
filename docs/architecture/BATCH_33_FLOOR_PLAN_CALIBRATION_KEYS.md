# Batch 33 — Floor Plan Calibration Keyboard Parity

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: `be6a8eadf0259ef7d95c3c67b9071d07f925c133`

## Scope

Batch 33 restores the small but useful keyboard controls attached to the v1.5.99 Floor Plan calibration workflow.

This is intentionally an interaction-parity batch; it does not change Floor Plan persistence or calibration math.

## Production behavior restored

While the 24″ × 24″ calibration square is active:

- Arrow keys move the square by **1 screen pixel**
- Shift+Arrow moves it by **10 screen pixels**
- the pixel distance is converted through the active Layout px/in scale
- movement is clamped so the square remains inside the DESIGN canvas
- editable inputs/textareas/selects/contenteditable surfaces keep their normal arrow behavior

While either Floor Plan calibration mode is active:

- Escape cancels calibration
- the calibration handler owns Escape before the general canvas keyboard surface can interpret it as an ordinary selection-clear action

## Architecture

`src/browser/floor-plan-calibration-model.ts` owns the pure keyboard geometry:

- production Arrow-key recognition
- 1 px / 10 px movement semantics
- px/in conversion
- canvas-bound clamping

`FloorPlanCalibrationSurface` owns DOM/event priority and delegates square movement to that model.

The keydown listener is registered in capture phase so an active calibration interaction can consume its own keyboard controls before generic canvas shortcuts.

## Tests

Batch 33 adds regression coverage for:

- exact 1-pixel nudge at a known px/in scale
- exact Shift 10-pixel nudge
- left/top/right/bottom clamping behavior
- restriction to the four production Arrow keys

Final Batch 33 CI at architecture head `dc60b6a41da583f89d399eeb2968b569f331764d`:

- Architecture CI run: `36877837313`
- TypeScript: pass
- ESLint: pass
- Tests: **306/306** across **39 files**
- Build: pass
- Browser artifact verification: pass
- JS: **348.74 kB / 87.09 kB gzip**
- CSS: **25.05 kB / 4.42 kB gzip**

Production `main` remains frozen at `77728eed327f144b0b1c5d4b9562747d8d62074e`.

## Deliberate boundary

Batch 33 does not alter:

- Floor Plan import/preparation
- distance calibration math
- square pointer create/move/resize behavior
- image-editor keyboard shortcuts/history
- ordinary canvas Piece/Room Feature arrow nudging

## Next batch

Continue acceptance parity with global editor Undo/Redo keyboard behavior. v1.5.99 explicitly supports Ctrl/Cmd+Z, Ctrl/Cmd+Y, and Ctrl/Cmd+Shift+Z outside typing targets; v1.6 already has typed history ownership, so the remaining work should be a thin keyboard adapter rather than new history architecture.
