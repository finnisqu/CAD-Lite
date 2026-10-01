# Batch 27 — Stone Materials Foundation

## Goal

Promote the v1.5.99 Stone Materials project selection/editor into the typed v1.6 architecture without expanding its production scope.

Stone Materials remain **project-level definitions** in this batch. Piece/Area assignment and material-aware slab behavior are intentionally not introduced because v1.5.99 itself labels those as future work.

## v1.5.99 behavioral source

The frozen production implementation at `main` / v1.5.99 remains the behavior baseline.

Production behavior confirmed during this batch:

- Materials are project-scoped, not Layout-scoped.
- The Navigator exposes one `Stone Materials` selection row.
- The row reports either `N configured` or `Not configured`.
- Opening Stone Materials selects the requested/current material, otherwise the first configured material.
- An empty project keeps the Stone Materials context open so a material can be added.
- Add creates `Material N` and selects it.
- New Materials use the editor's current default slab width and height.
- Delete asks for confirmation and selects the adjacent remaining Material.
- Deleting the last Material leaves the Stone Materials context open.
- Material edits are persistent project edits with Undo history.

## Typed domain

`src/domain/materials/index.ts` now owns Material creation and edit normalization.

### Defaults

New Material defaults match v1.5.99:

- name: `Material N`
- category: empty
- manufacturer: empty
- finish: `Polished`
- thickness: `3 cm`
- slab width: current editor default, otherwise `126 in`
- slab height: current editor default, otherwise `63 in`

### Validation

Inspector edits retain the production limits:

- thickness: `0.5–10 cm`
- slab width: `24–240 in`
- slab height: `24–120 in`
- blank required Material name falls back to `Material`
- blank Finish falls back to `Polished`
- Category and Manufacturer remain optional trimmed strings

## Commands

Batch 27 adds typed project commands:

- `addMaterial(materialId)`
- `updateMaterial(materialId, patch)`
- `deleteMaterial(materialId)`

All three:

- mutate only `ProjectState.materials`
- record one project History step
- schedule project persistence
- use structural sharing

Add/Delete also update the transient shared Selection because production immediately moves Material context to the affected row.

The older foundation `renameMaterial(...)` command remains exported for compatibility, while the browser Material Inspector uses the normalized `updateMaterial(...)` path.

## Selection model

The shared Selection union now distinguishes:

- `{ kind: 'material', id }` — a concrete configured Material
- `{ kind: 'materialCollection' }` — the Stone Materials context with no concrete row

This replaces the legacy combination of `selectedSelectionKey='stoneMaterials'` plus nullable `selectedMaterialId`.

A stale Material ID normalizes to the first configured Material, matching v1.5.99. If no Materials exist, it normalizes to `materialCollection`.

## Browser surface

`MaterialSurface` is a dedicated browser adapter rather than another responsibility added to the large Project/Layout surface.

It owns:

- the Selections / Stone Materials Navigator row
- configured/not-configured count text
- Stone Materials selection routing
- Material picker
- Add button
- production Material Inspector fields
- delete confirmation
- command dispatch for Material edits

In the architecture harness, the surface creates a small Selections card when the production host markup is not present. In a production-shaped host, it reuses `#lc-selections-card`.

## Inspector parity

The Inspector exposes the v1.5.99 fields and labels:

- Material / Color
- Category / Stone Type
- Manufacturer
- Finish
- Thickness (cm)
- Default Slab Width (in)
- Default Slab Height (in)

The empty state remains:

> No Stone Materials yet. Add one to define project material details.

The production foundation hint is retained:

> Stone Materials are project-level selections. Area/Piece assignment and material-aware slabs come next.

## Deliberate boundary after Batch 27

Not added in this batch:

- Material assignment to Areas
- Material assignment to Pieces
- Material-aware Piece coloring
- automatic Slab generation from a Material
- Material-to-slab image/library linking
- quantity/takeoff calculations by Material
- pricing or color-sheet integration

Those are separate product capabilities and should be migrated only when their v1.5.99/current-product behavior is audited or explicitly designed.

## Regression coverage

`tests/materials.test.ts` covers:

- production Material defaults
- text fallback behavior
- numeric clamping
- new Material slab defaults from editor preferences
- typed update behavior
- adjacent selection after deletion
- empty Stone Materials collection context
- stale Material selection fallback

Batch 27 therefore establishes a typed, command-backed, project-scoped Material foundation while preserving the exact scope boundary visible in v1.5.99.
