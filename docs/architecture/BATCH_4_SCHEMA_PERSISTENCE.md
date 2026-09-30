# Architecture Batch 4 — Canonical Schema and Persistence Boundary

Status: implementation checkpoint  
Behavior baseline: v1.5.99  
Branch: `architecture/v1.6-foundation`

## Purpose

Batch 4 gives CAD Lite an explicit, versioned file format and separates persisted
project/domain data from persisted editor/view preferences.

The v1.5.99 runtime remains untouched. This batch creates the new persistence
boundary and adapters that future runtime migration will use.

## Key decision: Project data is not UI state

v1.5.99 currently mixes several categories in its save/history payloads:

- project metadata
- materials
- layouts and drawing entities
- active layout
- workspace
- display preferences
- selection state in history/share snapshots

The canonical schema separates these.

```text
CadLiteFile
  schemaVersion
  appVersion

  project
    meta
    materials
    layouts

  editor
    activeLayoutId
    workspace
    preferences
```

Selection is intentionally not part of the canonical file.

## Schema version

The first architecture-native format is:

```text
schemaVersion: 1
```

This version number describes the persisted data schema, not the CAD Lite app
version. Future schema changes must migrate sequentially rather than relying on
application version strings.

Unknown future schema versions are rejected explicitly instead of being guessed.

## Project model

### ProjectMeta

- name
- date
- notes
- scratchpad

### Material

The current material fields are explicitly typed and normalized:

- id
- name
- category
- manufacturer
- finish
- thicknessCm
- defaultSlabW
- defaultSlabH

### Layout

The stable Layout core is explicitly typed:

- id
- name
- quantity
- DESIGN canvas size
- scale/grid
- grid visibility
- Piece fill opacity
- Areas + active Area
- Pieces
- Dimensions
- Notes
- Lines
- Room Features
- floor plan
- slab overlays

Current Layout fields not yet promoted to first-class architecture concepts are
preserved under `layout.extra`. This is intentional: it prevents data loss
without prematurely declaring every historical field part of the permanent
domain model.

Pieces and several feature entities are likewise preserved as JSON records at
this stage. They will receive dedicated typed schemas in their own migration
batches, after their semantics have been audited.

## Editor model

Persisted editor state contains:

- active Layout ID
- workspace
- display/editor preferences

The architecture uses `design | slab` for workspace terminology. The legacy
v1.5.99 value `layout` migrates to `design`.

Selection IDs from v1.5.99 history snapshots are not persisted in the canonical
file because selection is session interaction state.

## v1.5.99 compatibility adapter

The new importer recognizes both major v1.5.99 multi-layout forms:

1. `exportApp()` autosave shape, where preferences live under `ui`
2. `snapshotState()` history/share shape, where preferences and selection are
   top-level fields

Both migrate into the same canonical schema.

Backward compatibility is intentionally bounded. The architecture is not being
distorted to preserve every historical pre-v1.5 shape.

## Deterministic migration IDs

The old runtime sometimes generated replacement IDs with `Math.random()`
during normalization.

The architecture importer instead uses deterministic fallback IDs such as:

```text
migrated-layout-1
migrated-layout-1-area-2
migrated-layout-1-piece-3
```

This makes migration reproducible and testable. A given legacy file produces the
same canonical structure every time it is imported.

## Serialization

All canonical serialization passes through normalization before JSON is emitted.

Conceptual pipeline:

```text
legacy/canonical input
        ↓
detect format
        ↓
migration adapter
        ↓
normalize
        ↓
CadLiteFile schema v1
        ↓
serialize
```

## Deliberate boundaries

This batch does not:

- replace v1.5.99 autosave
- replace Undo/Redo snapshots
- change share links
- change localStorage keys
- fully type Piece/Sink/Cutout/Seam entities
- decide final slab inventory ownership
- move view preferences out of existing runtime state
- change production behavior

Those migrations occur only after the canonical boundary has been proven.

## Acceptance criteria

Batch 4 is accepted when:

1. v1.5.99 `exportApp()` data migrates to schema v1
2. v1.5.99 `snapshotState()` data migrates to schema v1
3. selection state is excluded from canonical project files
4. legacy missing IDs normalize deterministically
5. unknown future schema versions are rejected
6. canonical JSON round-trips without data change
7. Architecture CI passes typecheck, lint, tests, build, and artifact verification
