# Batch 47 — Final Architecture Acceptance Sweep

Status: complete — foundation accepted for continued integration, **not yet approved for production cutover**

Starting architecture head: `d1649739931ff02c334b01517040ebed5c70746f`

## Purpose

Re-read the original v1.5.99 architecture mandate against the current v1.6 branch after the parity and lifecycle-hardening batches, then separate two questions that had begun to blur together:

1. Is the new architecture foundation coherent and proven enough to build on?
2. Is the current v1.6 browser artifact itself ready to replace the production v1.5.99 application?

The answer to the first is **yes**. The answer to the second is **not yet**.

This is an important distinction. The branch has successfully established the new foundation, but the original acceptance contract also requires preservation of the complete v1.5.99 product experience, not merely equivalent domain capabilities behind an architecture harness.

## Evidence reviewed

The sweep reviewed the original `ARCHITECTURE_AUDIT_v1.5.99.md`, the current browser runtime/surface composition, the architecture harness, command exports, and the hardening coverage accumulated through Batch 46.

The original definition of success requires all of the following, among other architectural goals:

- CAD Lite still behaves like v1.5.99;
- production artifacts remain easy to deploy;
- source is modular and readable;
- domain entities have explicit schemas;
- meaningful mutations go through commands;
- persisted project state is distinct from session/UI state;
- Undo/Redo is transactional and predictable;
- tools share one lifecycle;
- geometry is testable without browser DOM;
- DESIGN and SLAB are explicit views of common entities.

The original manual acceptance suite also requires representative comparison of DESIGN, SLAB, editing, drag/resize/snap, shortcuts, Undo/Redo, save/reload, import/export, light/dark mode, and output behavior.

## Foundation status

### Proven / substantially satisfied

The current architecture has strong direct evidence for the structural foundation:

- typed Project / Session / Preferences state boundaries;
- command-driven domain edits;
- unified selection model;
- centralized history and autosave effects;
- canonical project lifecycle and v1.5.99 compatibility bridge;
- startup recovery;
- workspace-specific durable View state;
- shared DESIGN/SLAB Piece identity with workspace-specific placement;
- pure/testable geometry and snapping services;
- typed Piece, Sink, Cutout, Seam, fabrication, annotation, Room Feature, Floor Plan, Slab, Material, Area, Project, Layout, and Scratchpad behavior;
- browser interaction surfaces driven through the new store/command/effect boundaries;
- keyboard parity work for selection, duplication/copy/paste, Piece creation, history, workspace switching, annotations, Room Features, and calibration;
- deletion/stale-selection hardening;
- cross-Layout lifecycle hardening;
- save/reload/workspace continuity;
- autosave/startup-recovery/continue-editing continuity;
- browser-ready single JS/CSS build artifacts.

Batch 46 finished with 328 passing tests across 46 files and a successful browser artifact build.

## Cutover blockers found by the sweep

### 1. The current browser entry point is still an architecture harness, not the production v1.5.99 shell

`dev/index.html` explicitly identifies itself as **CAD Lite v1.6 Architecture Harness**. Its visible shell is a compact three-column test UI exposing Project, Layouts, Areas/Pieces, a canvas, a simplified Inspector, and selected workspace/View controls.

That is appropriate for foundation development, but it is not a drop-in recreation of the production v1.5.99 application shell.

This means passing architecture CI does **not** yet prove complete UI parity.

### 2. Browser-surface composition is intentionally narrower than the full production UX

The current runtime mounts typed surfaces for Project/Layout, project files, startup recovery, Materials, Scratchpad, View preferences, Piece/canvas interactions, Floor Plan flows, and Room Feature interactions. Much of the domain capability is present behind these surfaces, and `ProjectLayoutSurface` contains a substantial Inspector implementation.

However, the original v1.5.99 acceptance contract includes the complete production Navigator/Inspector/tooling experience: all entity lists, collapsible sections, toolbars/dropdowns, floating Mode HUDs, guided workflows, full View/Edit menus, production light/dark presentation, and other late-v1.5 UI behavior.

The current harness cannot be treated as evidence that those production surfaces are visually and interactively equivalent.

### 3. Visual parity has not been established

The architecture audit explicitly warned that historical CSS contains real product fixes and requires visual acceptance before consolidation. The automated suite validates logic and browser-ready build output, but it does not establish pixel/interaction parity for:

- Navigator and Inspector layout;
- toolbar/dropdown organization;
- collapsible behavior;
- floating HUDs;
- cursor/hover states;
- DESIGN vs. SLAB presentation;
- light/dark mode;
- modal preparation/calibration presentation;
- production responsive/fullscreen/theater behavior.

### 4. The golden-project manual acceptance pass remains outstanding

The original audit called for one difficult project containing most domain features and a side-by-side v1.5.99 versus v1.6 manual pass. The automated fixture/test coverage now exercises many of those behaviors individually and in lifecycle combinations, but that is not a substitute for the final integrated product pass.

### 5. Output/export parity still needs explicit product-level verification

Canonical project import/export is covered. The final acceptance contract also mentions PDF/image/export output where relevant. Those production-facing outputs must be inventoried and either verified on v1.6 or explicitly deferred before cutover.

## Decision

Do **not** merge the architecture branch into `main` or redirect the production site to the v1.6 artifact yet.

Also do **not** restart the architecture or perform another broad internal refactor. The foundation itself is now sufficiently proven. The remaining work is best understood as **production integration and acceptance**, not more foundation invention.

Production `main` remains frozen at v1.5.99.

## Recommended next phase

### Batch 48 — Production Shell Integration Inventory

Before moving code, build an exact migration map from the v1.5.99 production shell to the typed v1.6 surfaces.

For each production surface/behavior, classify it as:

- already implemented in typed v1.6 browser code;
- domain behavior exists but production UI binding is still missing;
- visual shell/CSS still needs migration;
- intentionally obsolete and requires explicit approval before removal.

The inventory should cover at minimum:

- top toolbar and menus;
- Project / Layouts;
- Materials / Selections;
- Areas;
- Piece Groups / Assemblies;
- Pieces;
- Sinks;
- Cutouts;
- Seams;
- Edge Profiles / Edges & Corners;
- Dimensions;
- Lines;
- Notes;
- Slabs / SLAB workspace;
- Room Features / Walls;
- Floor Plan import/preparation/calibration;
- Navigator lists and Inspector sections;
- floating Mode HUDs and guided workflows;
- View/Edit controls;
- Scratchpad;
- project import/export/recovery;
- keyboard shortcuts;
- fullscreen/theater/canvas controls;
- light/dark mode;
- PDF/image/share/output flows.

Then migrate the production shell in focused vertical slices using the already-proven command/store/domain foundation.

## Exit criteria for v1.6.0 cutover

Cutover should occur only when:

1. the production shell runs on the v1.6 typed runtime rather than the architecture harness;
2. every v1.5.99 acceptance-matrix row is implemented, explicitly approved as changed, or intentionally retired;
3. the golden project passes side-by-side DESIGN and SLAB acceptance;
4. representative edits, tools, snapping, keyboard behavior, Undo/Redo, save/reload, recovery, and outputs pass in the production shell;
5. light and dark mode receive visual QC;
6. Architecture CI remains green;
7. v1.5.99 remains available as the rollback point.

## Batch conclusion

The v1.6 architecture foundation phase has reached its intended architectural milestone. The next work should stop asking whether the core store/command/history/persistence architecture is viable and start connecting that proven foundation to the complete production CAD Lite experience.
