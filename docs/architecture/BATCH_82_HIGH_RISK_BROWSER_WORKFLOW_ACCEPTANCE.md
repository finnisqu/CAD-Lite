# Batch 82 — High-Risk Browser Workflow and Output Acceptance

## Goal

Exercise the browser workflows most likely to fail only after multiple production surfaces interact: Floor Plan import/preparation/calibration, production outputs and project files, viewport focus modes, and keyboard/tool lifecycle ownership.

Batch 82 is an acceptance/hardening batch, not a feature batch. It keeps the v1.5.99 product contract and the v1.6 ownership boundaries intact.

## Source-proven defect fixed

### Floor Plan modal keyboard focus

All Floor Plan dialogs share `createFloorPlanModal()`: PDF page selection, preparation/editor flows, calibration prompts, and related confirmation dialogs.

Before Batch 82 the modal's capture-phase shortcut blocker allowed Escape but treated Tab like a CAD shortcut whenever focus was on a non-editable control. The modal also opened without deliberately moving focus inside it. A keyboard user could therefore remain focused behind the overlay and could have normal Tab navigation swallowed by the browser-isolation layer.

Batch 82 freezes the modal contract as follows:

- Escape closes the active Floor Plan modal;
- Tab and Shift+Tab are never swallowed by the CAD-shortcut blocker;
- opening a modal places focus on its Close button immediately;
- focus wraps last → first and first → last;
- if focus somehow starts outside the dialog, the next Tab/Shift+Tab pulls it to the appropriate dialog edge;
- other non-editable CAD shortcuts remain isolated while the modal is open;
- input/textarea/select/contenteditable controls continue receiving normal editing keys;
- closing the modal restores the element that had focus before the dialog opened when it is still connected.

This is presentation/interaction state only. No project/domain ownership moved into the browser layer.

## Automated acceptance evidence

`tests/high-risk-browser-workflows.test.ts` adds one cross-surface release contract covering the following high-risk paths.

### Floor Plan PDF and image preparation

The suite freezes the browser wiring for:

- PDF recognition and PDF.js loading;
- PDF document creation from the selected file;
- multi-page page selection;
- preview rasterization using the current preview zoom;
- full prepared-page rasterization with the existing 3000-pixel maximum dimension;
- conversion of the prepared PDF page to PNG data before the image editor handoff;
- direct PNG/JPEG file reading as a data URL;
- handoff into the shared image preparation editor;
- crop and reset-crop;
- level/straighten;
- 90-degree rotation in both directions;
- horizontal/vertical flip;
- eraser cleanup;
- cleanup reset;
- preparation Undo/Redo;
- final Import Plan commit;
- pointer-cancel listener presence.

Existing Floor Plan domain tests continue to verify normalization, preparation defaults, rotated bounds, calibration, Layout resize, and DESIGN/SLAB ownership. Existing Floor Plan parity tests continue to protect browser-facing preparation/calibration behavior.

### Floor Plan modal and calibration keyboard

The new acceptance suite directly tests the pure modal keyboard helpers:

- Escape is reserved for modal close;
- Tab is reserved for focus navigation;
- other non-editable shortcuts remain blocked;
- forward/backward focus wrapping is deterministic;
- middle-of-dialog Tab navigation is left to the browser.

It also freezes the calibration keyboard behavior that actually exists on the live branch:

- Escape owns and cancels an active calibration;
- square calibration arrow-key nudging is recognized through the dedicated calibration helper;
- editable fields are excluded from calibration nudge handling;
- Shift is passed through as the accelerated nudge modifier;
- the known-distance calibration prompt deliberately focuses and selects its numeric input.

The existing calibration keyboard suite remains authoritative for pixel-scale nudge math and canvas clamping.

### PDF / PNG / SVG output

The suite freezes representative metadata and filenames from the v1.5.99 fixture:

- current Layout PDF;
- all-Layouts PDF;
- current Layout PNG;
- current Layout SVG.

It also verifies `productionOutputStateForLayout()`:

- does not mutate its input state;
- shares durable Project and Preferences state rather than cloning a second mutable truth;
- switches only the output session's active Layout;
- clears output selection;
- clears transient interaction state.

Existing `production-output-surface` tests remain the behavioral proof that all-Layouts PDF visits each Layout exactly once and that `ApplicationStatePreview` restores the active Layout after both successful and failed capture.

### JSON import/export remains separate

Batch 82 explicitly preserves the release boundary:

- `ProductionOutputSurface` owns PDF/PNG/SVG and uses `ApplicationStatePreview` for multi-Layout output;
- `ProjectFileSurface` owns canonical JSON serialization and project loading;
- output rendering does not call canonical file serialization;
- project JSON does not route through PDF output behavior.

The existing persistence contract and golden migration tests remain authoritative for canonical JSON round-trip stability, v1.5.99 import compatibility, autosave, recovery, and multi-workspace continuity.

### Browser focus modes and viewport

The suite freezes production wiring for:

- zoom helpers;
- Ctrl/Cmd-wheel zoom;
- pointer-anchored scroll correction;
- browser resize handling;
- Theater mode;
- native Fullscreen entry/exit.

Existing viewport geometry tests remain authoritative for the math. Existing production viewport tests remain authoritative for scale increments/clamping, anchored scroll math, and theme resolution.

### Keyboard and tool lifecycle

The suite freezes global keyboard ownership around:

- `defaultPrevented` honoring tool-specific listeners mounted earlier;
- editable-field shortcut isolation;
- Escape;
- Delete / Backspace;
- copy / paste / duplicate;
- tool-specific keyboard routing before the general canvas surface.

It also exercises the actual `ToolController` for:

- momentary Dimension press/release;
- locked Radius Escape cancellation;
- Room Wall Escape returning to the parent Room Features mode.

Existing selection, deletion, clipboard, nudge, tool, and hardening suites remain the detailed behavioral contract for those systems.

## Manual browser acceptance still required

Node/Vitest acceptance cannot honestly prove native file pickers, real PDF.js CDN loading, browser Fullscreen permission behavior, actual canvas raster quality, or large-file performance. Before cutover, the following should therefore be exercised in a real browser against the built v1.6 artifact.

### Floor Plan

- Import a normal PDF and a large/multi-page PDF.
- Change PDF page, preview zoom, and PDF preview rotation before preparing the page.
- Confirm the prepared page remains acceptably sharp at the existing full-preparation raster size.
- Import PNG and JPEG files directly.
- Rotate left/right, flip, crop, reset crop, level, erase, Undo/Redo, reset cleanup, and cancel preparation.
- Confirm Cancel never replaces the existing plan.
- Confirm Import Plan produces the prepared result.
- Run both distance and 24-inch-square calibration.
- Confirm Escape cancellation, arrow-key square nudging, and Shift-accelerated nudging.
- Confirm the known-distance numeric input receives focus/select behavior when its prompt opens.
- Tab and Shift+Tab through every Floor Plan dialog; focus must remain in the dialog and restore on close.

### Outputs / files

- Export current PDF, all-Layouts PDF, PNG, and SVG from a representative multi-Layout project.
- Inspect filenames and PDF header metadata visually.
- Confirm each all-Layouts PDF page corresponds to the intended Layout.
- Confirm Floor Plan imagery appears/omits according to the existing export contract.
- Confirm the active Layout/workspace/selection are unchanged after each output, including after cancelling or forcing a failed browser action where practical.
- Export JSON, reload the exported JSON into a fresh session, and confirm stable re-export.
- Import a v1.5.99 project and repeat JSON export/reload.

### Viewport / focus modes

- Zoom with toolbar controls, keyboard shortcuts, and Ctrl/Cmd-wheel around multiple pointer anchors.
- Scroll a large canvas before and after zoom.
- Resize the browser in DESIGN and SLAB.
- Enter/exit Theater repeatedly.
- Enter/exit native Fullscreen repeatedly.
- Move between Theater and Fullscreen and confirm neither leaves the page locked or panels stranded.
- Reload after representative viewport/workspace changes and verify only intended durable state returns.

### Tool lifecycle / keyboard ownership

- With no editable field focused, exercise Escape, Delete, Backspace, Copy, Paste, Duplicate, Select All, workspace toggle, and arrow nudges.
- Repeat while an input/select/textarea/contenteditable control is focused; browser editing must win.
- Exercise held/momentary Dimension, Splash, Radius, and Edge Painter tools.
- Exercise locked variants and HUD lock/unlock.
- Confirm one Escape does one coherent thing: tool cancellation/return first when the tool owns it, then general selection/focus-mode behavior on a later Escape.
- Confirm locked Pieces do not move from keyboard/pointer edits.
- Blank-click deselect after Piece, annotation, and Room Feature selection.

## Acceptance boundary

Batch 82 provides explicit automated evidence for the high-risk browser wiring and fixes the shared Floor Plan modal focus defect. It does **not** claim that a Node test runner executed native Fullscreen, a real OS file picker, the PDF.js CDN, or large-PDF rasterization. Those remain part of the final rendered browser acceptance before cutover.

No production redirect or `main` merge belongs in this batch.

## Next seam

Batch 83 is release-candidate cleanup:

- remove dead production harness paths and zero-consumer wrappers;
- remove debug logs, stale flags, obsolete hooks, duplicate CSS, and temporary migration comments when source-proven safe;
- retain the v1.5.99 importer, golden fixtures, useful development harnesses, and rollback artifacts;
- verify build metadata/version strings and `cad-lite-v1.6.0.js` / `cad-lite-v1.6.0.css` artifact naming;
- update architecture/release documentation for RC status.

Do not redirect production or merge `main` during Batch 83.
