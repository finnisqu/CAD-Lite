# Batch 23 — Room Features / Walls foundation

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: 5dfc9af95dd760c041b00055296f440c96021df9

## Scope

Batch 23 promotes Layout-owned Room Features from generic persisted entities into a
typed compatibility-safe domain.

The foundation covers:

- cabinet/base-like Room Features
- fillers / panels
- appliances
- walls
- legacy cabinet-run compatibility
- Layout persistence
- DESIGN selection
- visibility/category filters
- canvas projection
- Navigator ownership
- Inspector editing

Direct Room Feature placement/move/resize and the Q/W tool interaction model remain
the next interaction slice.

## Compatibility-safe schema

`src/domain/room-features/index.ts` introduces `RoomFeature`.

Known fields are normalized:

- id
- kind
- featureType
- name
- X / Y
- length / depth
- rotation
- visible
- countertop-receiving behavior
- group identity
- wall type
- optional wall height

Unknown v1.5.99 metadata remains preserved through the JsonObject compatibility
boundary.

This is intentional: Batch 23 establishes a typed API without throwing away old
cabinet-run/grouping or feature-specific fields that later batches may still need.

## Category projection

Room Feature category is derived in one domain selector rather than repeated through
UI code.

Canonical projection categories are:

- cabinet
- filler-panel
- appliance
- wall
- legacy-run
- other

Known legacy/type names such as base, vanity, panel, filler, dishwasher, range,
refrigerator, wall, knee wall, linked wall, and cabinet run map through this
selector.

## Walls

Walls remain Room Features rather than becoming a separate Layout collection.

Typed wall metadata includes:

- `wallType: full | knee | linked`
- optional physical height
- normal Room Feature position/length/depth/rotation

This preserves the existing unified Room Feature ownership while making full/knee/
linked wall semantics explicit for future tool behavior.

## Commands

Room Feature mutation now goes through AppStore commands:

- `addRoomFeature()`
- `updateRoomFeature()`
- `deleteRoomFeature()`

All three are valid only for the active Layout in DESIGN.

Add selects the new entity. Delete clears Room Feature selection when appropriate.

Each mutation therefore follows the same history/autosave/invalidation path as
Pieces, annotations, and slabs.

## Persistence cleanup

Layout `roomFeatures` now uses `RoomFeature[]`.

The old generic `normalizeEntityList()` compatibility helper became unused after
this migration and was removed rather than retained as dead architecture.

## Canvas projection

`src/browser/room-feature-canvas-model.ts` provides a read-only DESIGN projection.

It derives:

- normalized geometry
- rotated bounds
- selected state
- category
- wall type
- countertop-receiving state
- effective Room Feature opacity

The projection obeys the existing preferences:

- showRoomFeatures
- roomFeatureOpacity
- showRoomFeatureLabels
- showRoomCabinets
- showRoomFillersPanels
- showRoomAppliances
- showRoomWalls

Room Features render below countertop Pieces so Piece hit-testing keeps precedence
when countertop geometry overlaps cabinetry.

## Navigator

The DESIGN Navigator now includes a first-class Room Features section.

It exposes:

- global show/hide
- Base / Filler / Appliance / Wall architecture-harness add actions
- entity selection
- individual show/hide
- delete
- category and size summary

This is an architecture validation surface; production Q-mode placement will replace
the harness add shortcuts when that interaction layer migrates.

## Inspector

Selected Room Features receive a command-backed Inspector with:

- name
- feature type
- X / Y
- length / depth
- rotation
- visibility
- receives-countertop flag
- derived category
- delete

Walls additionally expose:

- full / knee / linked wall type
- wall height

## Tests

Batch 23 coverage includes:

- v1.5.99 Room Feature migration
- cabinet/base classification
- filler/panel classification
- appliance classification
- wall/knee-wall classification
- unknown historical metadata preservation
- add/edit/delete commands
- DESIGN-only mutation guard
- category visibility projection
- shared Room Feature selection
- rotated Room Feature hit testing

## Deliberate boundary

Still deferred:

- Q Room Feature mode
- W linked-wall shortcut behavior
- direct pointer placement
- drag/move
- resize handles
- rotation interaction
- cabinet-run generation/editing
- linked wall propagation
- countertop generation from receiving features
- detailed production-specific cabinet/appliance glyphs

Those behaviors can now target one typed Room Feature API rather than generic JSON
records.

## Next batch

The next coherent slice should be **Batch 24 — Room Feature / Wall interactions**:
wire Q parent mode and W/Wall child tools, placement previews, direct move/resize/
rotate editing, snapping, and linked-wall behavior through the shared ToolController.
