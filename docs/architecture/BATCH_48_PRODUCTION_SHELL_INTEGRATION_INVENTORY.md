# Batch 48 — Production Shell Integration Inventory

Status: complete

Starting architecture head: `cbe40936e6a19062d69546add63c4522c421234a`

## Goal

Convert the Batch 47 cutover boundary into a concrete integration checklist. The architecture foundation is no longer the main uncertainty; the remaining work is to reconnect the typed v1.6 runtime to the complete v1.5.99 production experience without reintroducing the monolithic architecture we just replaced.

This inventory intentionally does **not** change production `main` or claim cutover readiness. It classifies the visible production shell and workflows into four buckets:

1. **Migrated** — typed v1.6 browser/runtime support already exists and is exercised by the architecture harness/tests.
2. **Domain-ready / UI incomplete** — the domain/command behavior exists, but the full production-facing shell or interaction surface is not yet restored.
3. **Shell/CSS integration required** — behavior may exist underneath, but the v1.5.99 production presentation/navigation surface still needs to be rebuilt around it.
4. **Acceptance decision required** — behavior is known from v1.5.99, but the architecture branch does not yet provide enough evidence to call it intentionally obsolete or safely omit it.

## Evidence boundary

The current architecture browser entry point is explicitly `CAD Lite v1.6 Architecture Harness`. Its shell contains a compact Project/Layout/Area/Piece navigator, a single SVG canvas, a compact Inspector, Undo/Redo, DESIGN/SLAB controls, a subset of View controls, number format controls, and demo data.

The typed runtime already composes substantially more than that harness exposes: project-file lifecycle, startup recovery, Materials, Scratchpad, View preferences, Piece/annotation/Room Feature canvas behavior, Floor Plan preparation/navigation, selection, tools, history, autosave, and persistence.

The original v1.5.99 architecture audit and the production feature history establish a broader visible application: full top toolbar/dropdowns, Project/Layout navigator, selections/materials, Areas, Piece Groups/Assemblies, rich Piece fabrication inspector, sinks/cutouts/seams/edges/corners, Dimensions/Lines/Notes, SLAB workspace, Room Features/Walls, Floor Plan preparation/calibration, floating mode HUDs, guided workflow, fullscreen/theater, import/export, light/dark mode, and production-specific interaction polish.

Therefore this is an integration inventory, not a domain migration restart.

---

## A. Project / file / recovery lifecycle

### Migrated

- Typed Project state and metadata commands.
- Layout creation, rename, duplicate, quantity, reorder, delete, and active-layout behavior.
- Area creation, rename, reorder, assignment, active-area behavior, and deletion planning.
- Canonical v1.6 project export/import lifecycle.
- v1.5.99 compatibility import bridge.
- Autosave manager and startup recovery.
- Save/reload/continue-editing lifecycle.
- Cross-layout session/history boundaries.
- Startup recovery continuity.

### Shell/CSS integration required

- Restore the production file/menu affordances around the typed `ProjectFileSurface` rather than leaving file lifecycle primarily as architecture plumbing.
- Restore production-grade Project/Layout navigator styling, collapsible structure, action placement, empty states, and responsive behavior.
- Reconnect save/recovery status to the final production header/navigation treatment.

### Acceptance decision required

- Compare exact v1.5.99 import/export menu labels, supported user flows, confirmations, and download naming against the v1.6 surfaces during final shell integration.

---

## B. Navigator / Project / Layouts / Areas

### Migrated

- Typed Project/Layout/Area view model and browser surface.
- Layout and Area selection.
- Inline rename support.
- Layout quantity.
- Add/delete/duplicate behavior.
- Piece listing grouped through current layout/area state.
- Piece Group projection and group operations exist in the v1.6 domain/command layer.

### Domain-ready / UI incomplete

- Piece Groups / Assemblies need their full production navigator treatment, including the mature v1.5.99 list hierarchy and controls rather than only architecture-level support.
- Selection/material relationships need to be presented in the same production navigation context users already know.

### Shell/CSS integration required

- Rebuild the complete left-column production hierarchy: Project, Layouts, Selections/Stone Materials, Areas, Piece Groups/Assemblies, Pieces, and related lists.
- Restore collapsible headings, counts, inline rename, show/hide states, delete affordances, selection highlighting, preserved collapse state, spacing, typography, and icons.

---

## C. Materials / selections / stone

### Migrated

- Typed Materials domain/commands.
- `MaterialSurface` is mounted by the browser runtime.
- Material persistence is part of the project lifecycle.

### Domain-ready / UI incomplete

- Full v1.5.99 Selections / Stone Materials workflow is not represented in the compact architecture harness.
- Production material assignment and selection presentation should be verified against the actual v1.5.99 shell before cutover.

### Shell/CSS integration required

- Restore the production material/selection navigator and editor treatment, including slab imagery/stone context where applicable.

---

## D. Pieces and geometry

### Migrated

- Typed Piece model and geometry.
- Piece creation (`P` parity included), rename, transform, resize, mirror, duplicate, copy/paste, delete, group/ungroup.
- Piece drag/rotate/resize interactions.
- Piece keyboard nudging.
- Grid/Object snapping preferences.
- Piece fill visibility/opacity behavior.
- Piece selection and multi-selection foundations.
- DESIGN/SLAB piece projection.
- Piece fabrication entities are represented through typed commands/domain logic.

### Domain-ready / UI incomplete

- The architecture harness Inspector does not yet represent the complete mature v1.5.99 Piece Inspector experience.
- Production controls for all Piece properties, slab placement, edge/corner editing, fabrication details, and related convenience actions need shell integration.
- Full multi-select Inspector behavior should be checked against the v1.5.99 acceptance target rather than inferred from command coverage alone.

### Shell/CSS integration required

- Restore production Piece Inspector section structure, collapsible headings, field grouping, delete/duplicate actions, spacing, icons, and responsive sizing.
- Restore production canvas handles/hover states/cursors/alignment guides and visual polish around the typed interaction controllers.

---

## E. Sinks

### Migrated

- Typed Piece sink add/edit/remove/copy commands.
- Sink model catalog and per-piece limits exist in the v1.6 domain.
- Sink centerline View preference is wired into canvas projection.
- Piece Inspector code already imports and uses sink operations.

### Domain-ready / UI incomplete

- Restore the complete production Sinks Inspector workflow, including empty-state treatment, one consistent Add Sink affordance, sink model/options, offsets/setbacks, and all production validation/polish.

### Shell/CSS integration required

- Match the v1.5.99 Inspector hierarchy and visual language for Sinks.

---

## F. Cutouts

### Migrated

- Typed Piece cutout add/edit/remove/copy commands.
- Cutout perimeter/effective perimeter domain calculations.
- Cutout label visibility preference is wired into canvas projection.
- Piece Inspector code already imports cutout operations.

### Domain-ready / UI incomplete

- Restore the complete production Cutouts Inspector and canvas-editing affordances.
- Verify all v1.5.99 cutout types, labels, dimensions, and convenience controls during shell parity work.

---

## G. Seams / fabrication

### Migrated

- Typed Piece seam add/edit/remove commands.
- Fabrication split/merge preparation and transaction command path.
- Seam visibility preference.
- Piece seam geometry/domain support.

### Domain-ready / UI incomplete

- Full production Seam Inspector/list interaction needs to be reconnected.
- Verify piece-based seam offsets, existing seam edit ergonomics, hover/hitboxes, Shift straightening/inference, and fabrication split/merge presentation against v1.5.99.

### Shell/CSS integration required

- Restore production seam controls and visual treatment without bypassing the typed fabrication transaction path.

---

## H. Edge Profiles / Edges & Corners

### Migrated / domain-ready

- Piece state includes edge-profile/corner geometry concepts and the v1.6 Piece domain/Inspector has retained relevant fabrication foundations.
- View preferences include edge-profile visibility/label concepts.

### Domain-ready / UI incomplete

- This is a **high-priority shell parity area**. The architecture harness does not expose the mature v1.5.99 Edges & Corners UI.
- Restore side-specific edge profile editing, corner radius controls, labels, orientation, and the rectangle-style edge/corner interface.

### Acceptance decision required

- Verify exact v1.5.99 label placement/orientation and all edge-label display modes against production before calling parity complete.

---

## I. Dimensions

### Migrated

- Typed Dimension entity/commands.
- Dimension tool hotkey `D`.
- Point-accurate creation/editing foundation.
- Endpoint and offset interactions.
- Delete, copy/paste/duplicate parity through selection actions.
- Manual Dimension visibility.
- Shared fraction/decimal format and precision controls.
- Workspace-specific Piece Dimension visibility.

### Domain-ready / UI incomplete

- Restore the full production Dimension list and Inspector presentation.
- Verify double-click/inline length editing, label hitbox behavior, endpoint Shift straightening, H/V inference, dotted alignment helpers, preview points, fraction/decimal presentation, and production hover polish.

### Shell/CSS integration required

- Recreate production list/Inspector styling and tool-state feedback around the migrated typed annotation system.

---

## J. Lines

### Migrated

- Typed Line entity/commands.
- Line tool hotkey `L`.
- Endpoint interactions.
- Style, thickness, color, start/end caps in the typed model/Inspector path.
- Delete, copy/paste/duplicate parity.
- Line visibility preference.

### Domain-ready / UI incomplete

- Restore the mature production Line list and Inspector grouping, especially separate Start/End rows and clear style organization.
- Verify arrowhead trimming and production hover/selection polish.

---

## K. Notes

### Migrated

- Typed Note entity/commands.
- Note tool hotkey `N`.
- Note movement and leader commands.
- Delete, copy/paste/duplicate parity.
- Note visibility preference.

### Domain-ready / UI incomplete

- Restore production Note list/Inspector hierarchy, text editing experience, Add/Remove Leader treatment, and separate Delete Note row.
- Verify note/leader selection behavior and production auto-sizing/polish.

---

## L. SLAB workspace / slabs / overlay

### Migrated

- Explicit DESIGN/SLAB workspace state.
- Independent workspace-specific View state.
- Slab domain and add/update/delete commands.
- Slab canvas hit testing and selection.
- Piece slab-placement projection.
- Slab material visibility.
- Slab persistence through save/reload/recovery.

### Domain-ready / UI incomplete

- Restore the complete production SLAB workspace shell, slab navigator/list, Slab Overlay Inspector, and placement/editing controls.
- Verify production slab imagery/material behavior, overlay controls, and workspace-specific tool availability.

### Shell/CSS integration required

- DESIGN and SLAB should again feel like two polished views of one application rather than buttons in the architecture harness.

---

## M. Room Features / Walls

### Migrated

- Typed Room Feature domain and commands.
- Cabinet/filler-panel/appliance/wall categories.
- Tool lifecycle and hotkeys (`Q`, numeric kind selection, Space mode behavior).
- Canvas projection/hit testing.
- Drag/nudge interaction foundations.
- Master/category/label visibility preferences.
- Room Feature Inspector support exists in `ProjectLayoutSurface`.

### Domain-ready / UI incomplete

- Restore production Room Feature and Wall navigator/list/Inspector surfaces.
- Restore the mature placement/editing workflow and all production-specific property controls.

### Shell/CSS integration required

- Match v1.5.99 tool feedback, icons, selection states, list organization, and canvas visuals.

---

## N. Floor Plan

### Migrated

- Typed Floor Plan state/commands.
- Canvas projection.
- Navigator surface.
- Preparation surface.
- PDF import path.
- Image editor.
- Distance and square calibration.
- Calibration keyboard parity.

### Domain-ready / UI incomplete

- Restore the complete production Floor Plan import/prepare/calibration modal experience.
- Verify eraser behavior on large PDFs/images, rotate/prepare controls, calibration affordances, and production progress/help text.

### Shell/CSS integration required

- Reconnect the migrated Floor Plan surfaces to the final production menus/modals and styling.

---

## O. View / Edit / top toolbar

### Migrated

- Undo/Redo command/history behavior and keyboard parity.
- Workspace switching.
- Grid Snap and Object/Piece Snap preferences.
- Grid, Piece Dims, Piece Fills, Manual Dims, Notes, Lines, Room Feature visibility controls.
- Seams, Sink Centerlines, Cutout Labels, Slab Material controls remain owned by the Piece canvas surface.
- Shared number format/precision controls.
- `P`, `D`, `L`, `N`, Room Feature, Undo/Redo, selection/copy/paste/duplicate and other migrated keyboard behavior.

### Shell/CSS integration required

- Rebuild the complete v1.5.99 top toolbar and dropdown structure around typed commands/surfaces:
  - Undo / Redo;
  - Zoom +/- and canvas navigation controls;
  - Piece/Object Snap;
  - Reset;
  - View menu;
  - Import / Export menus;
  - Insert menu;
  - workspace controls;
  - tool icons and active states.
- Preserve one authoritative owner for each control. Do not repeat the duplicate-handler issue discovered during View migration.

### Acceptance decision required

- Inventory exact v1.5.99 menu entries and shortcut labels during shell implementation; do not assume the architecture harness is exhaustive.

---

## P. Floating Mode HUDs / brush modes

### Domain-ready / UI incomplete

- v1.5.99 had floating mode HUD work for Splash and related brush-style modes, including Scope selection, Add/Subtract semantics, contextual help, and a planned reusable HUD pattern.
- The architecture branch does not yet provide enough browser-shell evidence to call these production surfaces restored.

### Acceptance decision required

- Treat floating HUDs as a deliberate production parity workstream, not as automatically obsolete UI.
- During integration, identify which modes still need HUDs and bind them to typed tool/command state rather than porting old direct DOM mutation.

---

## Q. Guided workflow / walkthrough

### Domain-ready / UI incomplete

- v1.5.99 included a guided workflow/walkthrough concept with highlighted interface regions and progression tied to actual actions.

### Acceptance decision required

- This should remain on the parity checklist until explicitly retained, redesigned, or intentionally deferred. It should not silently disappear during cutover.

---

## R. Fullscreen / Theater / canvas sizing / zoom

### Shell/CSS integration required

- Restore production Fullscreen and Theater presentation modes.
- Restore production canvas width/height/grid/zoom controls and zoom +/- behavior.
- Verify resize behavior for Navigator/Inspector/canvas and SVG coordinate mapping in each mode.

### Acceptance decision required

- Exact production behavior needs browser-level parity testing because these concerns are shell/layout dependent rather than domain dependent.

---

## S. Inspector system

### Migrated

- Typed selection drives Inspector rendering for Layout, Area, Piece, annotation, Room Feature, and Slab contexts.
- Commands rather than direct state mutation are used for meaningful edits.

### Shell/CSS integration required

- Restore the mature production Inspector architecture:
  - consistent title/header spacing;
  - collapsible entity sections;
  - automatic shrink/grow behavior;
  - organized field rows;
  - full-width destructive/action rows where appropriate;
  - multi-entity behavior;
  - Slab Overlay section;
  - all fabrication subsections;
  - light/dark styling.

This is one of the largest remaining shell-integration tasks because the architecture harness deliberately uses a compact Inspector rather than the full v1.5.99 production presentation.

---

## T. Light / dark mode and visual system

### Shell/CSS integration required

- Restore the production visual system in both light and dark modes.
- Audit typography, header heights, arrows/collapse affordances, buttons, icons, trash/destructive states, hover/focus/selected states, empty states, spacing, panels, modals, HUDs, and canvas overlays.

### Acceptance decision required

- Theme/appearance is a shared preference concept, but final production theme parity must be verified visually; architecture tests alone cannot establish it.

---

## U. Interaction polish / browser-only acceptance

### Domain-ready / UI incomplete

The typed interaction controllers establish the correct architectural ownership, but final cutover still needs browser acceptance for production ergonomics:

- blank-canvas deselection;
- Escape behavior across tools and selections;
- Delete behavior for every selectable entity;
- cursor priority;
- hitbox conflicts;
- alignment guides;
- Piece-to-Piece snapping;
- Shift constraints/inference;
- hover states;
- drag handles;
- linked selections/moves;
- multi-selection;
- tool locking/momentary modes;
- focus/editable-field shortcut guards.

These should be verified in the production shell after integration rather than reimplemented speculatively now.

---

## V. Explicitly **not** classified as obsolete

At this stage, no major v1.5.99 production surface should be silently discarded merely because it is absent from `dev/index.html`.

In particular, the following remain acceptance items until explicitly resolved:

- complete top toolbar/dropdowns;
- production Navigator hierarchy;
- production Inspector hierarchy;
- Edges & Corners UI;
- Floating Mode HUDs;
- Guided Workflow;
- Fullscreen/Theater;
- zoom/canvas controls;
- light/dark mode;
- production modal/popover/help treatments.

The architecture refactor was intended to replace implementation structure, not reduce the product by accident.

---

## Recommended integration sequence

### Batch 49 — Production shell scaffold

Build the real v1.6 application shell around the typed runtime while keeping the architecture harness available for focused development/testing. Establish:

- production header/top toolbar containers;
- left Navigator;
- center canvas/workspace;
- right Inspector;
- modal/HUD portal regions;
- responsive/fullscreen/theater layout hooks;
- light/dark theme hooks.

Do **not** port all controls at once. The first goal is structural ownership and a stable shell.

### Batch 50 — Navigator + core toolbar integration

Reconnect Project/Layout/Selections/Areas/Pieces hierarchy and the common Undo/Redo, workspace, Insert/View, snap, zoom, import/export entry points.

### Batch 51 — Piece/Fabrication Inspector integration

Restore Piece, Sinks, Cutouts, Seams, Edges & Corners, Piece Groups/Assemblies, and fabrication controls using the existing typed commands/domain.

### Batch 52 — Annotation + Room Feature + SLAB Inspector integration

Restore Dimensions/Lines/Notes, Room Features/Walls, and SLAB/Overlay production surfaces.

### Batch 53 — Floor Plan + modal/HUD integration

Reconnect Floor Plan preparation/calibration and floating mode HUD/walkthrough surfaces.

### Batch 54 — Visual/interaction parity sweep

Perform light/dark, fullscreen/theater, canvas sizing/zoom, cursors, hover/hitbox, keyboard, snapping, alignment, and responsive QC against v1.5.99.

### Batch 55 — Cutover candidate

Run the complete v1.5.99 acceptance matrix against the production v1.6 shell, real saved projects, legacy imports, save/reload/recovery, and browser artifacts. Only then prepare a v1.6.0 production candidate.

The numbering is directional, not a quota. Combine or split batches when the code makes that safer.

## Batch 48 conclusion

The architecture foundation itself does not need another broad rewrite. The remaining risk is now **integration parity**: exposing the already-migrated domain/runtime through a complete production shell and explicitly resolving the handful of late-v1.5.99 UI systems that are not represented by the architecture harness.

Production `main` remains frozen at v1.5.99.
