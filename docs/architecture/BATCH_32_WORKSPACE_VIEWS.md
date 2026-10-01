# Batch 32 — Workspace-Specific View State

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: `b41b4bab7e0b3ce1a65938bdbaada47fc25a365f`

## Scope

Batch 32 restores the v1.5.99 contract that DESIGN and SLAB remember their own visibility/display choices.

The architecture already persisted `workspaceViews`, but it was treated as opaque compatibility data. This batch gives the known production subset typed ownership and restores save/load behavior when switching workspaces.

## Production view contract

The exact v1.5.99 workspace-specific keys are:

- `showGrid`
- `showDims`
- `showSinkCenterlines`
- `showManualDims`
- `showSeams`
- `showEdgeProfiles`
- `showPieceFills`
- `showSlabMaterial`
- `showNotes`
- `showLines`
- `showLabels`
- `showCutoutLabels`
- `showSplashLabels`
- `showSplashDims`
- `showSplashLabelDims`
- `showLabelDims`
- `showRadiusLabels`

Preferences outside that list remain shared across workspaces, including number format/precision, Room Feature display settings, Piece fill opacity, and other editor preferences.

## Persisted workspace names

The canonical application uses workspace names:

- `design`
- `slab`

The retained v1.5.99 workspace-view payload uses buckets:

- `layout` for DESIGN
- `slab` for SLAB

`workspaceViewStorageKey()` owns that compatibility mapping so browser/UI code does not need legacy naming knowledge.

## Typed helpers

`src/persistence/workspace-views.ts` now owns:

- the exact production `WORKSPACE_VIEW_KEYS`
- workspace bucket mapping
- capture of the active visibility state
- normalization/initialization of `workspaceViews`
- saving the current workspace state
- restoring a workspace state
- detection of preference patches that affect workspace-specific keys

Unknown historical metadata inside `workspaceViews` is retained while the known production boolean fields are normalized.

## First-toggle behavior

v1.5.99 has a subtle initialization contract when no workspace memory exists yet:

1. capture the pre-toggle visibility state
2. seed both DESIGN and SLAB buckets from that state
3. apply the user's toggle
4. save only the active workspace bucket

Batch 32 preserves that ordering centrally in `updatePreferences()`.

This prevents the first visibility change in a project from unintentionally changing both workspaces.

## Workspace switching

`setWorkspace()` now follows the production save → switch → load flow:

1. save the current workspace's top-level View state
2. switch DESIGN/SLAB
3. restore the destination workspace's saved View state
4. retain existing Piece-selection behavior
5. reset active interaction/transient state as before

The complete switch remains one command/state transition.

## Startup / migration behavior

Canonical normalization now restores the active workspace's saved View state after ordinary editor preference normalization.

Legacy v1.5.99 migration also passes through this canonical normalization seam, matching production load behavior where `workspaceViews` overrides the active workspace's top-level visibility values.

## Tests

Batch 32 adds regression coverage for:

- active-workspace View restoration during legacy migration
- independent DESIGN vs. SLAB visibility changes
- restoration when switching repeatedly between workspaces
- shared non-workspace editor preferences
- first-toggle seeding when `workspaceViews` is absent

The initial CI run exposed two unnecessary TypeScript assertions in the new test file; those were removed without changing runtime behavior.

Final Batch 32 CI at architecture head `ecc731237f5d2365cf788242bc96bbd8cde167ce`:

- Architecture CI run: `36876969851`
- TypeScript: pass
- ESLint: pass
- Tests: **302/302** across **38 files**
- Build: pass
- Browser artifact verification: pass
- JS: **347.68 kB / 86.84 kB gzip**
- CSS: **25.05 kB / 4.42 kB gzip**

Production `main` remains frozen at `77728eed327f144b0b1c5d4b9562747d8d62074e`.

## Deliberate boundary

This batch does not make every editor preference workspace-specific.

In particular, it does not independently store:

- Dimension number format/precision
- Room Feature visibility/category toggles
- Piece fill opacity
- edge label mode
- theme/appearance
- canvas zoom/pan behavior beyond any legacy metadata already retained in `workspaceViews`

Those remain shared unless a separately measured production contract says otherwise.

## Next batch

Continue the acceptance audit with another explicit v1.5.99 interaction gap. Floor Plan calibration keyboard behavior is a good candidate because production defines exact screen-based arrow nudge and Escape semantics that can be restored without changing the Floor Plan domain model.
