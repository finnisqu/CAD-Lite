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

## Deliberate boundary

This first Batch 18 commit establishes the domain/command boundary and regression coverage. Browser Navigator/Inspector projection is layered on top of these services in the same batch rather than duplicating grouping logic in the DOM layer.

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
