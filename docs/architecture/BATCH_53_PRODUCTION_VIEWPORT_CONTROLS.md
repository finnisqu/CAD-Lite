# Batch 53 — Production Viewport Controls

Status: complete

Starting architecture head: `f233d227255adeddfaea1bb8aba4f80bc62ffa72`

Validated implementation head: `4543240245a3707d5de30dbcc13046f667e7a89d`

## Goal

Restore the real v1.5.99 canvas / viewport interaction contract around the typed v1.6 renderer and production shell, without moving durable viewport state into shell-local browser state or weakening Undo/Redo behavior.

## v1.5.99 behavior audited directly

The production v1.5.99 source establishes the following viewport contract:

- Layout zoom is pixels per inch.
- Zoom range is 1 through 24 px/in.
- Zoom increment is 0.5 px/in.
- direct Zoom Out / Zoom In toolbar buttons exist.
- `Shift` + Plus / Equals zooms in.
- `Shift` + Minus / Underscore zooms out.
- the VIEW menu exposes numeric Canvas Width, Canvas Height, Grid Size, and Zoom controls.
- Canvas Width and Height have a 12 inch minimum.
- Grid Size has a 0.25 inch minimum.
- shrinking the DESIGN canvas clamps Pieces back inside the canvas.
- manually changing canvas width/height is disabled when a Floor Plan is driving canvas size.
- `Ctrl` / `Cmd` + wheel zooms around the pointer rather than the canvas origin.
- wheel zoom coalesces a short burst into one history/save step after approximately 180 ms.
- appearance supports Light, Dark, and System modes through `litecad:theme`.
- Theater and native Fullscreen are mutually exclusive.
- Theater keeps the full CAD workspace visible on desktop and occupies the browser area beneath the site / Squarespace header rather than hiding Navigator and Inspector.

This audit also corrected an earlier shell-only assumption that Theater should hide the side columns. That was not production parity and is no longer the v1.6 behavior.

## Durable typed Layout viewport state

The architecture already had the correct persistence boundary:

- Layout owns `cw`, `ch`, `scale`, and `grid`.
- Editor preferences do not own zoom or canvas dimensions.
- workspace-specific View buckets own visibility choices rather than geometry / zoom.
- PieceCanvas projection already consumes `layout.scale` directly.
- SVG pixel dimensions are derived from inch dimensions × scale while the SVG viewBox remains in inch coordinates.

No renderer architecture rewrite was needed.

## Typed viewport command

Added:

`src/app/commands/layout-viewport.ts`

Command:

`updateLayoutViewport(layoutId, patch, options?)`

Production constraints are enforced in the command layer:

- minimum canvas width / height: 12 inches
- minimum zoom: 1 px/in
- maximum zoom: 24 px/in
- minimum grid size: 0.25 inches
- DESIGN Piece poses are clamped back inside the canvas when it shrinks
- Floor Plan-driven Layouts reject manual width / height changes

The command normally records history and persists, but it also accepts explicit history / persistence policies for transient viewport interaction previews.

That option exists so high-frequency wheel preview frames do not each become their own Undo step.

## Production viewport surface

Added:

`src/browser/production-viewport-surface.ts`

The surface binds production shell chrome to typed Layout commands and browser-only presentation behavior.

### Zoom controls

Restored:

- top-toolbar Zoom Out
- top-toolbar Zoom In
- VIEW numeric Zoom
- `Shift` + Plus / Equals
- `Shift` + Minus / Underscore
- 1–24 px/in clamp
- 0.5 px/in step

### Pointer-centered wheel zoom

`Ctrl` / `Cmd` + wheel now matches the production interaction shape.

`anchoredProductionScroll(...)` preserves the same world coordinate beneath the pointer when scale changes.

Wheel zoom uses a short preview session:

1. wheel frames update Layout scale through `updateLayoutViewport(...)` with history and persistence skipped;
2. scroll offsets are adjusted so the pointer remains anchored;
3. subsequent wheel frames update the same preview session;
4. after `180 ms`, the surface restores the baseline scale without history/persistence;
5. the final scale is then committed once through the normal typed command path.

The result is immediate visual zoom with one normal Undo/Redo step for the complete wheel burst rather than one history entry per wheel tick.

The wheel session is also finalized before direct zoom or numeric viewport edits and when the surface unmounts.

## Canvas controls in VIEW

Production VIEW now exposes real controls for:

- Width
- Height
- Grid Size
- Zoom

Width / Height are disabled when:

- a Floor Plan controls the canvas dimensions; or
- the user is currently in SLAB, because those dimensions are DESIGN canvas dimensions.

Grid and Zoom remain available.

## Theater mode

The production Theater contract is restored rather than approximated.

Theater:

- exits native Fullscreen before entering;
- fixes the CAD shell beneath the detected Squarespace/site header;
- locks page scrolling;
- keeps Navigator, canvas, and Inspector visible on desktop;
- preserves responsive two-column/mobile behavior at narrower widths;
- exits on Escape when another tool/interaction has not already consumed Escape.

This explicitly replaces the earlier intermediate shell styling that hid Navigator and Inspector in Theater mode.

## Fullscreen

Native Fullscreen uses the browser Fullscreen API on the production shell.

Entering Fullscreen exits Theater first. Fullscreen state is synchronized from `fullscreenchange` rather than assumed from button clicks.

## Appearance

VIEW now exposes:

- Light
- Dark
- System

The selected mode is stored under:

`litecad:theme`

System mode follows `prefers-color-scheme` and updates if the operating-system preference changes.

The production shell resolves its theme through `data-theme` while keeping the chosen mode separately available for UI state.

## Production shell ownership

The completed viewport integration follows one ownership rule:

- `dev/production-shell.html` owns production control markup.
- `ProductionViewportSurface` binds behavior to that markup.
- typed commands own persisted CAD state.

An intermediate implementation briefly included browser-side fallback control injection. The final reconciliation removed that fallback after confirming the production shell already owns the static controls. This leaves one authoritative markup path and prevents duplicate control IDs or competing ownership.

## Tests

Added / expanded:

`tests/layout-viewport.test.ts`

Coverage includes:

- zoom and grid limits
- canvas minimum dimensions
- Piece clamping when the canvas shrinks

`tests/production-viewport-surface.test.ts`

Coverage includes:

- 0.5 px/in zoom steps
- 1–24 px/in zoom bounds
- Light / Dark / System resolution
- pointer-anchored world-coordinate preservation
- coalesced preview zoom producing exactly one normal Undo/Redo history entry

The wheel-history test explicitly exercises the same preview → restore baseline → final commit sequence used by the production surface.

## Validation

Architecture CI run: `36912558903`

Quality job: `110538545459`

Result: success.

Validated:

- TypeScript typecheck
- lint
- 345 / 345 tests across 51 files
- production build
- browser-ready artifact verification

Artifacts:

- JS: 375.02 kB / 93.28 kB gzip
- CSS: 64.52 kB / 9.39 kB gzip

## Production safety

Production `main` remains frozen at v1.5.99.

No v1.5.99 production artifact was modified in this batch.

## Remaining acceptance work

Batch 53 closes the major production viewport/control parity slice, but v1.6 is still not a production cutover candidate until the broader Batch 47 acceptance criteria are satisfied.

The highest-value next production-shell gap is the remaining Piece Inspector functionality that was intentionally not faked in Batch 52:

- Appearance
- Overhangs
- Splashes
- Edges & Corners / edge profiles

Those should be migrated as real typed controls and behavior, not visual placeholder sections.

After the missing Inspector capabilities and output/export flows are addressed, the branch still needs side-by-side golden-project visual/manual acceptance in DESIGN and SLAB, including Light/Dark, Theater, Fullscreen, tool workflows, and output parity.
