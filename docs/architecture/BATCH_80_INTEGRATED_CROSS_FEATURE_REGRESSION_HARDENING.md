# Batch 80 — Integrated Cross-Feature Regression Hardening

## Goal

Use the representative v1.5.99 golden migration project as an integrated release-candidate oracle across feature boundaries that had previously been validated mostly in narrower suites.

Batch 80 deliberately avoids new architecture abstractions. The persistence contract is frozen by Batch 79 and the dependency graph is guarded by Batch 78. This batch asks a different question: do the migrated systems continue to behave correctly when realistic user workflows cross several of those boundaries in one session?

## Scope

The new regression suite focuses on three high-value workflows.

### 1. Mixed DESIGN transaction

One command transaction edits multiple production feature families together:

- moves the Sink Run piece;
- relies on the linked backsplash invariant to follow the parent;
- updates the Island dimension;
- updates the Sink Base Room Feature;
- updates Floor Plan presentation state.

The test then proves:

- the transaction is one history step;
- the linked splash remains attached and synchronized;
- undo restores the complete pre-transaction project;
- redo restores the complete integrated edit;
- canonical export/reload preserves the resulting project and durable editor context.

This binds piece mutation, relationship synchronization, annotations, Room Features, Floor Plans, history, and persistence in one path.

### 2. Fabrication-family duplicate/delete lifecycle

The golden Sink Run belongs to a fabrication family with the Cooktop Run and also owns a linked backsplash. Batch 80 prepares and dispatches a structural duplication of that family, then deletes the original family.

The test proves:

- duplication copies the full three-piece lifecycle family;
- copied backsplash ownership points only to copied pieces;
- copied fabrication links point only to copied pieces;
- deleting the original family does not delete the copied family;
- undo/redo can cross both duplication and deletion cleanly;
- the final graph survives canonical export/reload.

This is intentionally broader than the existing isolated duplicate and delete tests because it validates relationship remapping and lifecycle boundaries together.

### 3. DESIGN → SLAB → autosave/recovery → output continuity

The third workflow edits the same project in both workspaces:

- moves/rotates the Island in DESIGN;
- switches to SLAB;
- assigns an independent slab pose to the Island;
- moves/changes the slab overlay;
- flushes autosave;
- starts a fresh runtime and explicitly recovers the autosave.

The test then proves:

- DESIGN and SLAB poses survive together;
- slab-overlay edits survive;
- startup recovery establishes a clean history/session baseline;
- SLAB projection sees the recovered slab state;
- production output projection for another Layout does not mutate the recovered live state;
- after switching back to DESIGN, Pieces, Annotations, Room Features, and Floor Plan projections remain available.

This binds workspace separation, slab state, autosave, startup recovery, output preparation, and browser projection models in one path.

## Release intent

Batch 80 is a regression-hardening batch, not a behavior redesign.

Production code should change only if these integrated workflows expose an actual defect. If the new tests pass against the existing runtime, that is the preferred result: it means the migrated systems already compose correctly and the release candidate gains permanent cross-feature protection without churn.

## Existing coverage retained

The new suite complements rather than replaces:

- the Batch 62 golden migration project;
- persistence and save/reload hardening;
- autosave/startup recovery tests;
- piece transform, duplication, splash, fabrication, annotation, Floor Plan, Room Feature, and SLAB unit/integration suites;
- Batch 78 architecture-boundary tests;
- Batch 79 persistence-contract freeze tests.

## Next seam

Batch 81 should move from model/integration hardening toward production browser acceptance and parity: keyboard/pointer tool cancellation, Navigator/Inspector coordination, modal/HUD behavior, focus/theater/fullscreen/theme surfaces, and representative user flows through the mounted browser runtime.

Fix only source-proven regressions. Do not reopen persistence schema or layer ownership unless a concrete release blocker requires it.
