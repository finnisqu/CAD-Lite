# Architecture Batch 42 — Post-Import Lifecycle Hardening

Status: complete  
Starting architecture head: `090c447dd3d71800806ccc6b30a6ed40bb9e906d`  
Validated implementation head: `4e073d9c295b601997b27f089ea34b2bfe2fb2d5`

## Scope

Pivot from the incremental View acceptance closure into architecture hardening by testing a real project lifecycle boundary end-to-end at the application layer:

1. import a v1.5.99 project,
2. begin editing the imported project,
3. undo and redo the new edit,
4. export the edited project as canonical v1.6 JSON,
5. diverge the live project,
6. reload the exported project,
7. verify the saved edit survives while transient session/history state is reset.

This is intentionally a test-first hardening batch. No production behavior was changed because the existing architecture already passed the lifecycle scenario.

## Coverage added

`tests/project-lifecycle.test.ts` now verifies that after a legacy import:

- the replacement begins from a one-entry history baseline,
- a new Piece can be added through the typed command path,
- the new edit enters history,
- Undo removes it,
- Redo restores it,
- canonical export contains the restored edit,
- later unsaved divergence can be discarded by importing that export,
- the reloaded project retains the saved Piece,
- transient selection is cleared,
- history is reset to a fresh non-undoable baseline after reload.

## Architectural significance

The scenario crosses several important boundaries in one test:

- v1.5.99 compatibility bridge,
- atomic project replacement,
- typed commands,
- history recording,
- Undo/Redo restoration,
- canonical v1.6 serialization,
- project reload,
- transient session reset.

That gives stronger confidence than testing those components only in isolation and establishes a pattern for the remaining hardening batches.

## Validation

Architecture CI run: `36894312756`

Validated successfully:

- TypeScript typecheck
- lint
- automated tests
- production build
- browser-ready artifact verification

## Deliberate boundary

This batch does not add or alter CAD features, browser UI, rendering, persistence schema, import format, or production behavior. It does not touch production `main` / v1.5.99.

## Next batch

Continue architecture hardening with another lifecycle/invariant boundary rather than returning to speculative View-control work. Good targets include cross-layout edits and selection normalization, deletion/stale-reference behavior, mixed-entity history, workspace switching around save/reload, and autosave/recovery continuity.
