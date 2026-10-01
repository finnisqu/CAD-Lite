# Architecture Batch 37 — Annotation View Controls

Status: complete  
Starting architecture head: `d688d7eff71517013c4bc0f21e3eb24f0a36166d`  
Validated implementation head: `bdf8e2f09eba824263307ee7db745b4a62072216`

## Scope

Continue the v1.5.99 acceptance audit through the View / Annotations layer without expanding feature scope.

Batch 36 established `ViewPreferencesSurface` as the browser boundary for shared number-format preferences. Batch 37 extends that same boundary to annotation visibility controls that are already represented by typed preferences and already consumed by the annotation projection.

## Production behavior preserved

The browser View boundary can now toggle:

- Manual Dimensions (`showManualDims`)
- Notes (`showNotes`)
- Lines (`showLines`)

These remain editor/view preferences rather than drawing-entity mutations. Individual annotation `visible` state remains separate from the global View preference, matching the existing model where both conditions must permit an annotation to render.

The existing workspace-specific preference persistence established in Batch 32 remains authoritative; this batch does not create a second workspace-view store.

## Architecture changes

Extended `ViewPreferencesSurface` with a typed mapping between browser control IDs and boolean annotation-view preferences.

The surface now:

- binds optional browser buttons for Manual Dimensions, Notes, and Lines;
- dispatches the existing typed `updatePreferences(...)` command rather than mutating state directly;
- reflects store state back to controls through `aria-pressed` and `is-active`;
- subscribes only to preference changes;
- clears its bound-control references on unmount;
- keeps the browser-ID-to-preference mapping explicit and independently testable.

No annotation rendering logic was moved into the surface. `annotation-canvas-model.ts` remains the read-only projection owner and already applies `showManualDims`, `showNotes`, and `showLines` when constructing the canvas projection.

## Tests

Extended `tests/view-preferences-surface.test.ts` to cover:

- Manual Dimensions control mapping;
- Notes control mapping;
- Lines control mapping;
- rejection of unrelated controls so this surface does not accidentally claim Seams or Object Snap ownership.

## Validation

Architecture CI run: `36887067243`

Validated successfully:

- TypeScript typecheck
- lint
- automated tests
- production build
- browser-ready artifact verification

## Deliberate boundary

This batch does not redesign the production View menu, change individual annotation visibility, migrate Seams/Sink Centerlines/Cutout Labels/Object Snap controls away from their current canvas adapter, add new view preferences, or change annotation rendering geometry.

It only extends the typed View preference browser boundary for existing annotation visibility behavior.

## Next batch

Continue the acceptance audit with another measured View/Edit/canvas parity gap. Prefer extending explicit typed boundaries over adding speculative UI or new feature behavior.
