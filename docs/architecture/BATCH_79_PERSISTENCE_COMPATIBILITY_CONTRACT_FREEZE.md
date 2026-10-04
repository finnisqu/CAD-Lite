# Batch 79 — Persistence / Compatibility Contract Freeze

## Goal

Freeze the v1.6 persistence and compatibility contract before integrated release-candidate hardening.

This batch intentionally does **not** redesign the schema. The current schema, v1.5.99 importer, autosave/recovery path, workspace durability model, and project-file ownership are already mature. Batch 79 locks those boundaries together with one focused regression suite so later release work cannot accidentally widen or blur what CAD Lite persists.

## Contract frozen by this batch

### Canonical v1.6 file ownership

A canonical CAD Lite file contains only:

- `schemaVersion`
- `appVersion`
- durable `project` state
- durable `editor` state:
  - `activeLayoutId`
  - `workspace`
  - `preferences`

Selection, active interaction/tool state, pointer/hover previews, and other transient session values are deliberately excluded from project persistence.

Workspace-specific view state remains intentionally durable through `preferences.workspaceViews`. That is part of the v1.6 persistence contract, not transient session leakage.

### Compatibility

The v1.5.99 compatibility importer remains supported and isolated under `src/persistence/legacy/`.

Both supported legacy payload families remain contractual inputs:

- v1.5.99 `exportApp` project payloads
- v1.5.99 history/share snapshot payloads

Both must converge to canonical schema v1, and canonical serialization must be byte-stable after a fresh deserialize/serialize cycle.

### Autosave / startup recovery

Autosave uses the same `cadLiteFileFromApplicationState()` → canonical serializer seam as explicit project export. It must not persist selection, interaction, or transient preview state.

Existing startup-recovery coverage remains authoritative for restoring autosaved project/editor durability into a clean history/session baseline.

### History

History remains an application concern separate from project-file persistence. Existing history coverage remains authoritative for undo grouping, workspace undoability, selection fallback, and the deliberate exclusion of preference/active-layout changes marked outside history.

Project import/reload/recovery must continue to establish a fresh history baseline rather than restoring an old undo stack.

### Output

Rendered PDF/PNG/SVG output remains owned by `ProductionOutputSurface`; project JSON import/export remains owned by `ProjectFileSurface` / `ProjectLifecycle`.

Temporary all-layout/output preview state is a system-only application-state swap. It must not:

- alter canonical project export
- schedule or overwrite autosave
- create history entries
- leak a preview session into the restored application state

The baseline must be restored even if output work throws.

### Multi-layout and DESIGN / SLAB continuity

The Batch 62 golden migration project and existing lifecycle/workspace hardening tests remain the integrated oracle for:

- multi-layout persistence
- DESIGN ↔ SLAB continuity
- workspace-specific durable view settings
- canonical save/reload stability
- v1.5.99 import
- representative production feature families

The small `v159-project.ts` fixture remains small and focused. The large `v159-golden-project.ts` fixture remains the integrated migration oracle.

## Batch 79 additions

Added `tests/persistence-contract-freeze.test.ts` to bind previously separate guarantees together at the release boundary:

1. canonical file ownership excludes non-durable session state;
2. both v1.5.99 payload families converge to byte-stable canonical v1 files;
3. autosave and explicit project export use the same canonical contract;
4. output preview swaps remain invisible to persistence/history and restore the exact baseline after a failure.

No production-runtime or schema change is intended in this batch unless these assertions expose a real defect.

## Release rule after Batch 79

Treat schema v1 and the compatibility behavior above as frozen for v1.6.0.

Do not change the persisted schema, compatibility interpretation, or project/editor ownership boundary during Batches 80–84 unless a concrete release blocker demonstrates that the frozen contract is wrong.

## Next seam

Batch 80 — integrated cross-feature regression hardening.

Use the golden project to exercise representative user workflows across feature boundaries rather than extending architecture abstractions or persistence shape.
