# Batch 29 — Project File Lifecycle

Batch 29 promotes whole-project file handling into a first-class application service instead of leaving import/export/reset behavior in browser event handlers.

## Scope

This batch adds:

- canonical schema-v1 JSON export from current application state;
- atomic import of both canonical v1.6 files and supported v1.5.99 payloads;
- a New Project reset path;
- session/selection/tool cleanup on successful replacement;
- a fresh Undo/Redo baseline after import/reset;
- immediate autosave replacement after import/reset;
- browser New / Import / Export controls for the architecture harness;
- failure-path coverage proving malformed, unrelated, and future-schema files cannot partially replace the live project.

PDF, PNG, SVG, share-link export, cloud storage, and production menu design remain outside this batch.

## Application boundary

`ProjectLifecycle` owns whole-project replacement semantics.

The important ordering rule is:

1. Parse and migrate the candidate file completely.
2. Build the replacement `ApplicationState` completely.
3. Only then invoke runtime cleanup hooks.
4. Replace the store in one system commit.
5. Reset history to the replacement state.
6. Flush canonical autosave immediately.

Malformed JSON, unrelated JSON, and unsupported future schemas fail during steps 1–2, before active interaction state is touched.

## Import compatibility

The lifecycle uses the existing persistence migration boundary, so the same import path accepts:

- schema-v1 canonical CAD Lite files; and
- supported v1.5.99 export/snapshot payloads.

No browser-specific migration logic is introduced.

## Export contract

Project export serializes only canonical durable data:

- project state;
- active layout/workspace;
- durable editor preferences.

Transient selection, interaction sessions, tool state, and transient browser state are not exported.

The browser download filename is derived from the project name and ends in `.cadlite.json`.

## New Project semantics

New Project clears project content and session state while preserving durable editor preferences. Workspace returns to DESIGN, active layout becomes null, selection is cleared, active tools are cleared, and Undo/Redo begins again from the new blank state.

## Browser integration

`ProjectFileSurface` binds to `#lc-new-project`, `#lc-import-project`, `#lc-export-project`, `#lc-project-file-input`, and `#lc-file-status` when supplied by a host UI.

The architecture harness receives a fallback control strip automatically so this lifecycle can be exercised without redesigning the production toolbar during the architecture phase.

## Deliberate boundary

Batch 29 does not yet define:

- production Import / Export dropdown layout;
- Save As / recent-files UX;
- PDF/PNG/SVG export;
- share links or cloud persistence;
- file association / native desktop integration;
- autosave recovery prompts at startup.

Those can build on the same `ProjectLifecycle` boundary without changing domain or persistence ownership.
