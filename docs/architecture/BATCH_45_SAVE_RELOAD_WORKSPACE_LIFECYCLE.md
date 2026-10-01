# Batch 45 — Save / Reload / Continue Editing Lifecycle

Status: complete

Starting architecture head: `4fc7823f5b3d8ee16851d665ac858ca83e671b9f`

Validated implementation head: `20e396256121be81fb661467c8480d8072d46be7`

## Goal

Exercise CAD Lite as a saved working application rather than as isolated command and preference units: configure a project and workspace, save it, diverge from that saved state, reload the saved project, and continue editing through a fresh history timeline.

## Audit result

The existing canonical file bridge already persists the durable editor state required for this workflow:

- active Layout;
- active DESIGN/SLAB workspace;
- editor preferences, including workspace-specific View buckets;
- shared number-format preferences.

Transient session state is intentionally excluded. `ProjectLifecycle` rebuilds a clean session on replacement, resets history, and immediately flushes the replacement to autosave.

No production code change was required. The architecture already satisfied the intended lifecycle contract, so this batch adds integration coverage rather than manufacturing a refactor.

## Coverage added

`tests/save-reload-workspace-lifecycle-hardening.test.ts` verifies two end-to-end scenarios.

### Durable state survives reload

The test configures different DESIGN and SLAB visibility values, shared decimal/precision settings, an active Layout, active SLAB workspace, and a saved project edit. It then deliberately diverges the live state and reloads the saved file.

After reload it verifies:

- the saved project content wins over unsaved divergence;
- the saved active Layout is restored;
- the saved SLAB workspace is restored;
- selection is reset to `none`;
- active interaction/tool state is clean;
- history is reset to a one-entry baseline;
- SLAB View settings are active;
- DESIGN View settings remain independently stored and return when switching back to DESIGN;
- shared number format and precision survive the workspace switch.

### Editing continues normally after reload

The second scenario reloads a saved project, adds a Piece through the typed command layer, verifies the new Piece selection/history entry, then Undo/Redo verifies the new post-reload history timeline behaves normally.

## Validation

Architecture CI run `36900897395` passed:

- typecheck;
- lint;
- 327/327 tests across 45 files;
- production build;
- browser-ready artifact verification.

Build output:

- JS: 352.07 kB / 87.86 kB gzip
- CSS: 25.05 kB / 4.42 kB gzip

## Deliberate boundary

This batch does not change project-file schema, persistence semantics, workspace behavior, UI controls, rendering, or production v1.5.99 behavior. It verifies the existing v1.6 save/reload contract.

## Next

The foundation is now ready for a broader startup/autosave recovery continuity pass or final acceptance/QC sweep. The next hardening slice should test a realistic autosave → startup recovery → continue editing path before cutover readiness is assessed.

Production `main` remains frozen at v1.5.99.
