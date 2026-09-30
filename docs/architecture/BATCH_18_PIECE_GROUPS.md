# Batch 18 — Piece Groups and fabrication Assembly projection

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: 383efebd53a936ab52e57ccba12d9d919cbba502

## Production audit

v1.5.99 uses the same persisted `pieceGroupId` / `pieceGroupName` fields for two distinct DESIGN concepts.

- Ordinary countertop Groups are user-created with Group Selected Pieces.
- Converted fabrication Assemblies are seam-linked Pieces whose `assemblyLinks` make the relationship authoritative.
- Backslashes are not direct Group members; linked splashes inherit their parent's Navigator context.
- Group numbering follows first appearance of non-backsplash grouped Pieces.
- Navigator badges use G# for ordinary Groups and A# for fabrication Assemblies.
- A Group header selects the full Group and can collapse/expand its member rows.
- Group selection is a DESIGN concept. SLAB continues to edit individual fabrication placements.
- Ordinary Groups can be ungrouped. Fabrication Assemblies cannot be ungrouped while physical seam links exist.
- Renaming applies one shared name to every member.
- Group Inspector summary reports Piece count, total square feet, DESIGN overall bounds, sink count, seam count, and linked splash count.
- Split sink fragments sharing one `fabricationSplitSinkId` count as one physical sink.
- Converted fabrication seam IDs count once even though the paired link exists on both members.
- Creating a new Group may orphan one member of an older ordinary Group; v1.5.99 removes singleton Group metadata during normalization.

## Architecture extraction

Batch 18 adds a pure Piece Group projection under `src/domain/pieces/groups.ts`.

The projection derives:
- stable display number and badge
- ordinary Group versus fabrication Assembly kind
- shared display name
- exact member IDs
- DESIGN bounds and production-style summary statistics
- exact selected-Group recognition

No new persisted Group entity is introduced. The v1.5.99 compatibility model remains authoritative: Group identity is metadata on Pieces, while fabrication seam links remain the physical relationship.

Commands now own Group mutations:
- `groupPieces`
- `renamePieceGroup`
- `ungroupPieceGroups`

All three are history/autosave transactions. Group and ungroup are DESIGN-only, and ungroup explicitly rejects seam-linked fabrication Assemblies.

## Browser projection

The architecture harness now consumes the same Group projection in both Navigator and Inspector.

Navigator behavior:
- one Group/Assembly header per persisted Group
- G# for ordinary Groups and A# for fabrication Assemblies
- shared Group name and production-style Piece/seam meta
- header click selects the exact Group and toggles member collapse
- linked backsplash rows inherit their parent's Group collapse context
- expanded member rows remain individually selectable

Inspector behavior:
- an exact DESIGN Group selection opens a first-class Group/Assembly summary
- shared rename writes through one command to every member
- ordinary Groups expose Ungroup
- seam-linked fabrication Assemblies do not expose Ungroup
- Group deletion uses the existing graph-aware Piece deletion transaction
- unrelated multi-Piece DESIGN selections expose Group Selected Pieces
- fabrication Assembly selection keeps the existing Fabrication Seams / Merge controls visible below the Assembly summary

SLAB intentionally does not project a Group selection: physical fabrication Pieces remain independently placeable there.

## Deliberate boundary

Batch 18 does not create a separate persisted Group table, migrate sidebar drag-reordering of whole Groups, or add a dedicated canvas Group bounding box. Those are not required to establish Group/Assembly ownership and Inspector semantics and can be layered on the same projection later.

## Tests

Coverage includes:
- ordinary versus fabrication classification
- stable G#/A# numbering
- DESIGN-only exact Group selection
- overall Group bounds
- split-sink de-duplication
- seam and linked-splash summary counts
- grouping across existing metadata
- singleton normalization
- shared rename
- ordinary ungroup
- fabrication ungroup rejection
- SLAB mutation guard
- Navigator/Inspector consume the same derived Group/Assembly identity
