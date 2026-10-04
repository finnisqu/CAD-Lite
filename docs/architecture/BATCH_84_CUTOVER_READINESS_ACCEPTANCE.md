# Batch 84 — Final Cutover-Readiness Acceptance

## Goal

Batch 84 is the final release-readiness gate for CAD Lite v1.6.0. It does not introduce product behavior, redesign architecture, or broaden the migration. Its purpose is to answer one release question: **is the architecture branch ready to replace v1.5.99, subject to the remaining real-browser acceptance boundary?**

Starting baselines for this batch:

- architecture branch: `architecture/v1.6-foundation` at Batch 83 commit `4acbe98c30fa0c6939f652d075b153bbb173be0e`;
- production branch: `main` frozen at v1.5.99 commit `77728eed327f144b0b1c5d4b9562747d8d62074e`.

Batch 84 must not merge, redirect, or otherwise modify production.

## Final integrated cutover journey

`tests/cutover-readiness.test.ts` adds one deliberately difficult cross-system acceptance path rather than duplicating the detailed unit coverage already accumulated through the migration.

The journey exercises:

1. v1.5.99 golden-project import through the compatibility path;
2. activation of the representative Kitchen Layout in DESIGN;
3. additive multi-Piece selection;
4. one atomic mixed DESIGN transaction covering Piece geometry, a Dimension, a Room Feature, and the Floor Plan;
5. linked-splash synchronization after the parent Piece moves;
6. one-step undo and redo of the integrated transaction;
7. DESIGN → SLAB transition;
8. independent SLAB Piece placement plus Slab Overlay editing;
9. autosave of the combined DESIGN/SLAB state;
10. canonical v1.6.0 JSON export;
11. startup recovery into a fresh runtime;
12. clean recovery history/selection/transient state;
13. byte-stable canonical re-export after recovery;
14. SLAB projection integrity;
15. non-mutating output preparation for another Layout and representative output filename generation;
16. return to DESIGN with Piece, annotation, Room Feature, and Floor Plan projections intact.

The intent is to catch integration drift that could survive feature-by-feature tests while failing in a realistic cutover sequence.

## Final automated acceptance matrix

Batch 84 relies on the complete repository suite, not only the new cutover test. The relevant release evidence is distributed across the established contracts:

- **v1.5.99 migration compatibility:** golden migration fixtures, compatibility migration, canonical serialization, and stable re-import/re-export.
- **Difficult integrated project:** the large v1.5.99 golden fixture includes multiple Layouts, Areas, materials, Pieces, Piece Groups, sinks, cutouts, planning/fabrication seams, linked splash, annotations, Room Features, Floor Plan, and Slabs.
- **DESIGN / SLAB identity:** independent Piece placements, workspace projections, Slab overlays, and save/recovery continuity.
- **Commands / history:** transaction atomicity, meaningful undo labels, one user action per history entry, undo/redo, and transient-preview exclusion.
- **Snapping / numeric interaction policy:** Piece snapping, interaction thresholds, point-accurate geometry, weak/forced orthogonal behavior, viewport scaling, resize/rotation helpers, and direct-manipulation geometry.
- **Selection / duplicate / delete:** unified selection, additive/range selection, clipboard/duplication graph remapping, lifecycle-family delete behavior, blank deselection, and stale-selection sanitation.
- **Keyboard / tool lifecycle:** Escape/Delete ownership, editable-field isolation, momentary and locked tools, Room Feature submode return, calibration keyboard behavior, and earlier-listener `defaultPrevented` handling.
- **Persistence / autosave / recovery:** frozen schema ownership, canonical JSON, autosave parity, startup recovery, workspace restoration, clean post-recovery history, and output-preview isolation.
- **Outputs:** current/all PDF metadata, PNG/SVG filenames, Layout-specific output projections, state restoration, and separation of project JSON from rendered outputs.
- **Production shell:** toolbar, Navigator, Inspector, HUD/modal mount points, disclosure structure, modal focus behavior, theme wiring, Theater/Fullscreen wiring, responsive CSS contracts, and output controls.
- **Architecture boundaries:** dependency direction, browser mutation ownership, renderer/application separation, and removal of the obsolete runtime bridge.
- **Release artifacts:** runtime/package release identity `1.6.0`, production entry, final artifact filenames, and disabled production source maps.

The full Architecture CI gate remains authoritative for TypeScript, ESLint, Vitest, production Vite build, and browser-ready artifact verification.

## Cutover verdict model

Batch 84 uses two distinct verdicts so automated evidence is not confused with native-browser evidence.

### Automated / code-level verdict

If the complete Batch 84 Architecture CI gate passes, the v1.6.0 architecture branch is **GO / cutover-ready at the code level**. A green result means there is no known source-level, type, lint, automated regression, production-build, or artifact-verification blocker in the tested contract.

### Production deployment verdict

Production replacement remains **conditional GO** until one final real-browser smoke/visual pass succeeds against the exact Batch 84 build.

This is not a newly discovered defect. It is the explicit acceptance boundary retained from Batches 81–83 because Node/Vitest cannot honestly prove native browser and rendered behavior.

## Final real-browser cutover smoke

Before redirecting production, exercise the exact Batch 84 `cad-lite-v1.6.0.js` / `cad-lite-v1.6.0.css` build in a real browser and confirm at minimum:

- light, dark, Navigator, Inspector, menus, HUDs/modals, long labels, and responsive widths render without material regression;
- DESIGN and SLAB remain visually and interactively distinct;
- Theater and native Fullscreen enter/exit cleanly and restore layout state;
- a normal PDF and a large/multi-page PDF load through the real PDF.js path;
- Floor Plan rotate/crop/level/erase/Undo/Redo/calibration flows work with native file selection and acceptable raster quality/performance;
- representative current/all PDF, PNG, SVG, and project JSON exports succeed and preserve the active working state;
- a v1.5.99 project imports, exports as canonical v1.6.0 JSON, reloads, and remains usable;
- Escape, Delete, duplicate/copy/paste, arrow nudge, tool lock/momentary behavior, and editable-field shortcut isolation feel coherent in the mounted browser.

Any material failure in this smoke pass is a release blocker and should become a narrowly scoped Batch 85 only if needed.

## Known limitations / deferred work

The following are not represented as automated passes:

- native OS file-picker behavior;
- live PDF.js CDN/network loading;
- large-PDF browser memory/performance and final raster sharpness;
- browser permission behavior around native Fullscreen;
- pixel-level visual parity across browsers and display sizes;
- final human assessment of interaction feel.

They remain deployment validation, not reasons to reopen the architecture migration by default.

## Rollback plan

The rollback anchor remains the untouched v1.5.99 production state:

- `main`: `77728eed327f144b0b1c5d4b9562747d8d62074e`;
- existing v1.5.99 production artifacts remain available;
- the v1.6.0 compatibility importer remains intentionally retained.

If a production blocker appears after cutover, restore the deployed site references to the v1.5.99 artifacts / frozen `main` state while the blocker is isolated on the architecture line. Do not destroy or rewrite the rollback anchor as part of the v1.6 deployment.

## Recommended cutover sequence

1. Build the exact final Batch 84 architecture SHA.
2. Run the real-browser smoke checklist above against that exact build.
3. If it passes, obtain explicit cutover approval.
4. Deploy `cad-lite-v1.6.0.js` and `cad-lite-v1.6.0.css` without deleting the v1.5.99 rollback artifacts.
5. Verify production startup, a representative project import/edit/save/output cycle, and DESIGN/SLAB immediately after deployment.
6. If a material blocker appears, restore v1.5.99 and address the blocker separately.

Batch 84 itself stops before step 3. It does not merge `main` or redirect production.

## Completion evidence

The final Batch 84 completion record must report:

- exact final architecture commit SHA;
- exact Architecture CI run and conclusion;
- authoritative Vitest file/test count;
- production artifact names;
- confirmation that `main` is still frozen at `77728eed327f144b0b1c5d4b9562747d8d62074e`;
- final recommendation using the automated-GO / browser-smoke-conditional distinction above.

No Batch 85 is planned unless the final manual browser smoke or the Batch 84 quality gate reveals a concrete release blocker.
