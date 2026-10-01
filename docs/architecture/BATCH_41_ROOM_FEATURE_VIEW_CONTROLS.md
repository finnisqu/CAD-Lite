# Architecture Batch 41 — Room Feature View Controls

Status: complete  
Starting architecture head: `2e37881391953cd7e96d40050ecd4be694e43a08`  
Validated implementation head: `85b1c707f5baf76710c58c2200c77845c8997f3c`

## Scope

Continue the measured v1.5.99 View acceptance pass with the existing Room Feature visibility preferences. The typed preference model and Room Feature canvas projection already contained the behavior, but the architecture browser harness did not expose controls for exercising it.

This batch closes that browser parity gap for:

- all Room Features (`showRoomFeatures`)
- Room Feature labels (`showRoomFeatureLabels`)
- cabinets / legacy cabinet runs (`showRoomCabinets`)
- fillers and panels (`showRoomFillersPanels`)
- appliances (`showRoomAppliances`)
- walls (`showRoomWalls`)

## Existing rendering behavior

`createRoomFeatureCanvasProjection` already applies the master `showRoomFeatures` preference and the category-specific cabinet, filler/panel, appliance, and wall preferences before projecting visible Room Features. `PieceCanvasSurface` already checks `showRoomFeatureLabels` while rendering projected items.

This batch therefore introduces no new Room Feature rendering semantics.

## Implementation

`ViewPreferencesSurface` now owns typed browser bindings for:

- `lc-show-room-features` -> `showRoomFeatures`
- `lc-show-room-feature-labels` -> `showRoomFeatureLabels`
- `lc-show-room-cabinets` -> `showRoomCabinets`
- `lc-show-room-fillers-panels` -> `showRoomFillersPanels`
- `lc-show-room-appliances` -> `showRoomAppliances`
- `lc-show-room-walls` -> `showRoomWalls`

The controls use the existing `updatePreferences` command and the same `aria-pressed` / `is-active` reflection as the other typed View controls.

The architecture harness now exposes matching buttons so these existing preferences can be exercised directly during browser acceptance testing.

## Tests

The View preference mapping tests now verify all six Room Feature control mappings while continuing to reject controls owned by other browser surfaces.

## Validation

Architecture CI run: `36892402963`

Validated successfully:

- TypeScript typecheck
- lint
- automated tests
- production build
- browser-ready artifact verification

## Deliberate boundary

This batch does not change Room Feature creation/editing, individual entity visibility, opacity, category classification, rendering style, workspace behavior, or keyboard behavior. It does not migrate Seams, Sink Centerlines, Cutout Labels, Slab Material, Object Snap, or Grid Snap from their existing canvas ownership.

Production `main` / v1.5.99 remains untouched.

## Next batch

The remaining acceptance work should now become more selective. Continue only with clearly measured parity gaps whose behavior already exists or whose missing behavior is directly supported by v1.5.99 evidence; otherwise transition into the broader architecture-hardening and real-project lifecycle pass.
