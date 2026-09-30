# Batch 17 — Fabrication seam conversion + merge

Behavior baseline: v1.5.99
Branch: architecture/v1.6-foundation
Starting architecture head: 0b40fdf21bd00efacd0f788a6cc0006aea4423f0

## Production audit

### Cut into Pieces

Production exposes `Cut into Pieces` only from a planning seam while in SLAB.

A cut is rejected when:

- the source is not a countertop Piece
- the planning seam no longer exists
- the seam is 0.25 in or closer to either Piece edge
- the new cut would divide an existing perpendicular fabrication seam

Existing parallel fabrication seams are allowed and are rewired onto the appropriate child.

### Child geometry

A split replaces one source Piece with two real Pieces.

- Vertical cut: child A is left, child B is right.
- Horizontal cut: child A is top, child B is bottom.
- A keeps the source layer; B uses source layer + 0.001.
- Names become `<source> A` and `<source> B`.
- A/B inherit or create one fabrication Assembly group.
- The newly exposed joint edge profile becomes `seam`.
- Joint-side corner radii become zero.
- Joint-side overhang becomes zero.

DESIGN and SLAB poses are both derived from the source's local coordinate frame. Each child's local center is mapped through the source workspace rotation and then converted back to the child's rotated AABB top-left. Production clamps each resulting pose to its workspace.

### Sink split behavior

Sinks and faucet holes are treated as one fabrication cutout family for seam-span detection.

The sink envelope contains:

- the rotated sink bowl bounds
- every configured faucet hole using its actual setback, spacing, and diameter

If that envelope crosses the cut:

- the sink is copied to both children
- both fragments share `fabricationSplitSinkId`
- both fragments get independent sink IDs
- each fragment stores authoritative Piece-local `fabricationPose`
- rendering clips each fragment to its child Piece

If the sink does not cross the cut it moves to one child and its local reference-side coordinates are remapped into that child's coordinate system.

### Cutout split behavior

General cutouts use their rotated local bounds to decide whether they span the fabrication cut.

If they cross:

- both child fragments get new cutout IDs
- both share `fabricationSplitCutoutId`
- each retains the physical opening center in the child's local coordinate space, even when that center lies outside the child

Non-spanning cutouts move to one child with a new cutout ID.

### Planning seam remapping

The planning seam used for the physical cut disappears.

Other planning seams are remapped as follows:

- seams parallel to the cut remain on whichever child contains their coordinate
- parallel seams after the cut shift into child B's local origin
- seams perpendicular to the cut are duplicated onto both children with new seam IDs

All resulting seam offsets use Left/Top references and production three-decimal coordinates.

### Existing fabrication links

Existing parallel seam links are carried to the correct child and the mate Piece is rewired from the retired source ID to that child.

The new physical joint is stored as a paired `assemblyLinks` seam relationship with:

- one shared link ID
- mating Piece IDs
- local seam sides and mate sides
- vertical/horizontal orientation
- original source countertop name
- source planning seam ID
- original cut coordinate

### Linked splashes

Linked splash behavior is part of the split transaction.

- A splash on a non-spanning exterior edge is re-parented to the corresponding child.
- A splash on an edge crossed by the cut is duplicated so each child owns one linked splash.
- linked-length splashes resize to their new parent edge
- snapped splashes re-derive DESIGN placement from their new parent

SLAB placement is reset to the typed architecture fallback because production deletes stale splash slab placement after re-parenting.

### Selection / history

After a SLAB cut, only child A is selected so the two fabrication pieces can immediately be nested independently.

The entire operation is one history/autosave transaction.

## Merge production audit

Merge operates on a known paired fabrication seam link.

A merge is rejected when:

- the paired seam sides are no longer compatible
- DESIGN rotations differ by more than 0.01°
- vertical seam members have different depths by more than 0.01 in
- horizontal seam members have different widths by more than 0.01 in
- DESIGN seam edges are more than 0.125 in apart
- corresponding exterior overhangs differ across the seam
- corresponding exterior edge profiles differ across the seam

SLAB placement of the second child does not need to be adjacent. This is intentional: users can nest the fabrication pieces independently after cutting, then merge back from their known DESIGN joint.

### Merged geometry

The left/top member is normalized as the first anchor.

The merged Piece:

- gets a new Piece ID
- restores source name from seam metadata when available
- combines width or height
- restores exterior edge profiles
- restores exterior corner radii
- restores exterior overhangs
- anchors DESIGN placement from the first member
- anchors SLAB placement from the first member regardless of where the second was nested

### Sink merge

Split sink fragments sharing one `fabricationSplitSinkId` collapse back to one sink in merged local coordinates.

If no other fabrication Piece outside the pair still carries that split ID, the sink becomes an ordinary sink again and clears both `fabricationSplitSinkId` and `fabricationPose`.

If another external Piece still carries the same split family, split identity remains.

### Cutout merge

Cutouts are similarly merged into one coordinate space.

- every merged cutout receives a new cutout ID
- duplicate fragments sharing a split ID collapse to one
- split identity clears only when no outside Piece still carries that family

### Planning seams and external fabrication links

Planning seams from both children are transformed into merged coordinates, de-duplicated by orientation/coordinate within 0.001 in, and assigned new seam IDs.

External fabrication seam links survive. Their mate relationships are rewired from the two retired child IDs to the new merged Piece.

### Linked splashes and groups

Linked splashes on valid exterior edges are re-parented to the merged Piece. Duplicate splash fragments created by the cut collapse back to one per edge.

Invalid/internal splash relationships are detached with linked length disabled.

Group normalization runs after split and merge. A two-member fabrication group disappears when merged back to one countertop; a larger run keeps its group identity and the merged Piece remains associated with the remaining fabrication members.

## Architecture extraction

Batch 17 introduces `src/domain/pieces/fabrication.ts`.

The core architecture is **prepare → commit**:

1. `prepareFabricationSplit` / `prepareFabricationMerge` inspect an immutable Layout.
2. Every required Piece/link/seam/sink/cutout/split-family ID is allocated before dispatch.
3. The preparation returns a complete typed Piece graph plus the intended selection.
4. `applyFabricationTransaction` commits that graph only when the Layout JSON signature is still exact.

This keeps reducers deterministic and prevents stale geometry from partially applying.

### Prepared transaction shape

A prepared fabrication transaction contains:

- operation kind (`split` or `merge`)
- source Layout signature
- complete resulting typed Piece graph
- resulting selected Piece IDs
- one history label

The reducer additionally enforces that split commits occur only while the same Layout is active in SLAB.

## Type boundary improvements

Batch 17 also promotes known fabrication relationship metadata in `AssemblyLink`:

- side / mateSide
- orientation
- sourceName
- cutCoordinate

`SplashAttachment` now types source edge, linked-length, snap state, and offset while keeping linked parent IDs non-null. In v1.6, a detached backsplash relationship is represented by `attachment: null`; this keeps parent lookups strict while preserving the same detached behavior.

## Browser harness

The architecture harness now exposes:

- `Cut into Pieces` under each planning seam while in SLAB
- production 1/4 in edge guard
- prepared split transaction on click
- `Fabrication Seams` rows when the selected Piece set contains both mating members
- `Merge` for each known paired fabrication seam
- preparation failure reasons surfaced through the browser alert

Because DESIGN selection expands fabrication assemblies, selecting a converted countertop in DESIGN surfaces its Merge controls naturally. SLAB cut selection remains one child only.

## Tests

Batch 17 adds coverage for:

- split dimensions and both workspace poses
- edge profile / corner / overhang ownership
- paired fabrication link metadata
- split selection behavior
- crossing sink + faucet-family splitting
- split sink fabrication poses
- crossing cutout fragments
- perpendicular planning seam duplication
- linked splash splitting and linked-length resize
- 1/4 in cut guard
- perpendicular-existing-link rejection
- external parallel-link rewiring
- merge reconstruction
- split sink/cutout family collapse
- planning seam de-duplication
- linked splash re-merge
- independent SLAB nesting with DESIGN merge adjacency
- external link preservation in a three-Piece fabrication run
- stale prepared transaction rejection
- one history step / undo
- SLAB-only split commit enforcement

## Next batch

Batch 17 closes the largest deferred cross-domain mutation routine from v1.5.99.

The next useful architecture batch should move upward from fabrication geometry into **Assembly / Piece Group projection and Inspector behavior** so DESIGN can represent fabrication assemblies as a first-class editing context rather than merely a multi-Piece selection.
