# Batch 81 — Production Browser Acceptance and Parity Hardening

## Goal

Move release hardening above the domain/application layers and inspect the actual v1.6 production browser shell: toolbar menus, Navigator, Inspector, HUDs/modals, keyboard ownership, theme/focus modes, responsive behavior, and mounted output controls.

Batch 81 is not a redesign. It fixes only source-proven browser regressions and freezes the browser acceptance hooks that must remain present through release-candidate cleanup.

## Source-proven defect fixed

### Room Feature modal keyboard focus

The Room Feature dialog isolates canvas shortcuts with a capture-phase keyboard blocker. Before Batch 81, that blocker also intercepted `Tab` whenever focus was on a non-editable control such as Close, Cancel, or Add Feature.

That meant keyboard users could lose normal focus navigation exactly where a modal should keep focus predictable.

Batch 81 changes the modal contract so:

- `Escape` remains reserved for closing the dialog;
- `Tab` and `Shift+Tab` are not swallowed by the canvas-shortcut blocker;
- focus wraps from the last focusable control to the first and from the first back to the last;
- focus that somehow begins outside the dialog is pulled to the appropriate edge of the dialog on the next Tab;
- other non-editable canvas shortcuts remain isolated while the modal is open;
- text/select editing continues to receive normal keyboard input;
- closing the modal still restores the previously focused control when possible.

No CAD project/domain state ownership moved into the browser layer.

## Automated production-browser acceptance contract

`tests/production-browser-acceptance.test.ts` now protects the mounted production shell at source level.

### Shell hooks

The suite verifies unique production IDs for the controls/surfaces that typed browser adapters bind to, including:

- Undo / Redo;
- Zoom in / out;
- Piece Snap / Grid Snap;
- Theater / Fullscreen;
- DESIGN / SLAB workspace switches;
- drawing SVG;
- Inspector mount;
- modal and HUD portal roots;
- Floor Plan and project import;
- project export.

This catches accidental duplicate IDs, deleted mount points, or template drift before the production artifact is built.

### Disclosure structure

The suite verifies that:

- each production toolbar menu trigger has a matching menu panel;
- each Navigator section has a matching disclosure toggle and body;
- the shell retains the production Navigator and Inspector regions.

Existing focused unit tests continue to protect stable ARIA disclosure IDs and accordion state.

### Event-owner mount order

The runtime intentionally mounts the Piece canvas before the general canvas keyboard surface and mounts production HUD/shell/viewport adapters afterward.

That ordering is important because a tool-specific key handler must be able to `preventDefault()` before the more general keyboard/focus adapters decide whether the event is still theirs.

Batch 81 freezes that ordering as a browser acceptance contract rather than treating the multiple listeners as accidental duplication.

### Output menu continuity

The static production shell still contains the historical output-parity note as a fallback placeholder, but `ProductionOutputSurface` replaces that state at mount.

The acceptance suite proves the mounted output surface still generates:

- PDF — all Layouts;
- PDF — current Layout;
- PNG — current Layout;
- SVG — current Layout;

and hides the placeholder note.

Project JSON remains owned separately by `ProjectFileSurface`.

### Theme and focus-mode runtime wiring

The automated suite freezes the production hooks that connect the shell to appearance and focus modes:

- theme resolution writes the resolved theme onto the production shell;
- Theater toggles the shell's Theater state;
- Fullscreen state is reflected on the shell;
- Theater and Fullscreen controls remain present and wired by the viewport surface;
- the shared portal layer for HUDs and modals remains present;
- light / dark / system theme resolution stays deterministic.

The Batch 81 source audit also confirmed explicit CSS support for dark theme, Theater, Fullscreen, responsive panel breakpoints, long-label ellipsis, destructive styling, portal layering, and HUD help presentation. Those visual rules are intentionally **not** asserted by Vitest because this repository's test transform does not preserve stylesheet source as test text. Their actual rendered behavior remains part of the manual visual acceptance pass below.

## Manual visual acceptance checklist

Text-based CI cannot prove pixel-perfect rendering, so the following remains an explicit human browser pass before cutover. A pass here should be performed against the built production shell, not inferred from source.

### Desktop shell — light and dark

- Top toolbar has a consistent height and no wrapped/overlapping controls at normal desktop width.
- Navigator and Inspector titles have matching visual hierarchy and padding.
- EDIT / VIEW / INSERT / IMPORT / EXPORT menus open above the canvas without clipping.
- Menu destructive actions read as destructive without overpowering normal controls.
- Light and dark modes keep readable borders, labels, disabled states, hover states, and selected states.
- System theme follows the browser/OS preference.

### Navigator

- Project, Layouts, Selections, Areas, Pieces, and Slabs disclosure arrows point consistently and collapse/expand the correct body.
- Collapsed Navigator state survives reload where local storage is available.
- Selected Layout/Area/Piece/Stone/Room Feature rows remain visually distinguishable.
- Long Layout, Area, Piece, material, group, annotation, and Room Feature names truncate cleanly rather than widening the panel.
- Delete/trash controls remain visually distinct from neutral row actions.
- Empty states and counts do not change section header height unexpectedly.

### Inspector

- Piece Info / Appearance / Overhangs / Splashes / Edge Options / Sinks / Cutouts / Seams / Fabrication Seams use one consistent exclusive accordion treatment.
- Non-Piece contexts collapse from their heading without hiding the wrong context.
- The Inspector shrinks when sections collapse and grows again when reopened.
- Input rows remain aligned; Start/End style controls do not collapse into ambiguous multi-column layouts.
- The Inspector heading remains padded consistently with Navigator rather than hugging the corner.

### HUDs and modals

- Dimension, Note, Line, Room Features, Wall, and Linked Wall HUDs identify the active mode correctly.
- Splash, Radius, and Edge Painter keep their specialized HUDs rather than receiving a duplicate generic HUD.
- HUD help text truncates cleanly and its `title` tooltip exposes the full help text.
- HUD dragging stays inside the HUD mount bounds.
- Lock / unlock / close behavior matches the active tool family.
- Add Room Feature modal opens above the app in normal, Theater, and Fullscreen modes.
- Tab cycles through all Room Feature controls; Shift+Tab cycles backward; focus never escapes behind the modal.
- Escape closes the Room Feature modal and restores prior focus.
- Background click closes only when clicking the modal overlay itself.

### DESIGN / SLAB and focus modes

- DESIGN and SLAB switches show one unambiguous active workspace.
- SLAB-only controls appear only in SLAB and DESIGN-only controls do not leak into SLAB.
- Theater hides Navigator and Inspector without breaking canvas sizing or scroll.
- Fullscreen fills the viewport and restores normal shell state when exited.
- Escape precedence feels coherent: active tools/selection can consume Escape before Theater exit rather than causing multiple unrelated actions from one keypress.
- Zoom controls, Ctrl/Cmd-wheel zoom, resize, and scroll remain usable in normal, Theater, and Fullscreen modes.

### Responsive widths

- Around 1120 px, hiding status text does not overlap toolbar controls.
- Around 980 px, hiding Inspector leaves the canvas and Navigator usable.
- Around 760 px, hiding Navigator leaves the canvas/tooling usable.
- HUD and Room Feature modal controls reflow cleanly at narrow widths.

### Floor Plan presentation

- Floor Plan Navigator controls remain legible in both themes.
- Prepare/calibration dialogs are not clipped by shell panels or focus modes.
- Large/long Floor Plan names do not break Navigator width.

## Acceptance boundary

Batch 81 provides automated source/contract evidence plus a concrete visual checklist. It does **not** claim pixel-perfect browser parity without a rendered browser comparison.

The automated suite is intended to prevent structural regressions between now and v1.6.0. Any discrepancy found during the manual visual pass should be treated as a release blocker only when it materially differs from the v1.5.99 product contract or makes the v1.6 shell harder to use.

## Next seam

Batch 82 should exercise the high-risk browser workflows rather than repeat visual styling review:

- Floor Plan PDF/image import and prepare workflow;
- rotate/crop/erase/calibration;
- output generation and state restoration for PDF/PNG/SVG/JSON;
- fullscreen/theater/zoom/resize/scroll transitions;
- Escape/Delete/blank-deselect/locked and momentary tool lifecycles;
- editable-field shortcut isolation.

Use explicit evidence for each workflow. Do not redirect production or merge `main` during Batch 82.
