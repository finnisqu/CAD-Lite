# Batch 46 — Autosave Recovery Continuity

Status: complete

Starting architecture head: `713500563ae39388c2b5fbef868a4fe18417f323`

Validated implementation head: `350d9a9ac08a7e8eebcc893d5625b2092e604d25`

## Goal

Exercise the recovery path as a real interrupted-workflow boundary: edit a working project, persist it through autosave, simulate a new CAD Lite runtime, recover that autosave, then continue editing with normal workspace and Undo/Redo behavior.

## Coverage added

`tests/autosave-recovery-continuity-hardening.test.ts` now validates this end-to-end sequence:

1. Start from the v1.5.99 compatibility fixture.
2. Select the Kitchen Layout and SLAB workspace.
3. Change durable View/number-format preferences.
4. Rename the Layout and add a Piece.
5. Leave transient selection state active.
6. Flush the pending autosave to shared storage.
7. Stop the first runtime and create a fresh runtime against the same storage.
8. Inspect and explicitly accept the divergent recovery payload.
9. Verify recovered project content, active Layout/workspace, preferences, clean selection/tool state, and a fresh one-entry history baseline.
10. Verify the recovered autosave is now recognized as current.
11. Switch to DESIGN, add another Piece, and confirm the post-recovery commands create a new history timeline with working Undo/Redo.

## CI correction during the batch

The first test expectation treated the post-recovery workspace switch as if it were outside history. CI correctly exposed that assumption: `setWorkspace('design')` is itself a history-recorded command, so the subsequent Piece addition is the third history entry rather than the second.

The test was corrected to explicitly assert that behavior instead of changing production code. This gives the lifecycle test a more accurate contract: recovery resets history, and normal history recording resumes immediately for subsequent user commands, including workspace switching.

## Validation

Architecture CI run `36901222840` passed:

- typecheck;
- lint;
- 328/328 tests across 46 files;
- production build;
- browser-ready artifact verification.

Build output:

- JS: 352.07 kB / 87.86 kB gzip
- CSS: 25.05 kB / 4.42 kB gzip

## Deliberate boundary

No production code was changed. The existing autosave, startup-recovery, project-replacement, workspace, command, history, and persistence architecture already satisfied the tested workflow.

Production `main` remains frozen at v1.5.99.

## Next

The major foundation lifecycle boundaries now have direct integration coverage: legacy import, editing/history, save/reload, deletion/selection cleanup, workspace persistence, autosave, startup recovery, and continued editing.

The next batch should pivot into a final architecture acceptance/QC sweep against the v1.5.99 acceptance matrix rather than continuing to manufacture isolated hardening scenarios. Any remaining concrete parity or invariant gap found by that sweep should be fixed before v1.6.0 cutover readiness is assessed.
