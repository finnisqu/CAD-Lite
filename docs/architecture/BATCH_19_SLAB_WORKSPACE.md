# Batch 19 — SLAB workspace foundation

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: 7836243b388ad60e448dd03b9dc542b0a32a7b2e

## Why this batch exists

The Piece foundation already preserved one Piece identity across DESIGN and SLAB and
gave each Piece an independent SLAB placement. Rotation, move, nudge, fabrication
split/merge, sinks, cutouts, and Piece Groups therefore already understood the SLAB
pose.

What remained untyped was the other half of the workspace: the physical slab
surfaces themselves. Legacy Layout.overlays were still generic persisted entities,
while slab canvas sizing and nesting behavior read historical values indirectly.

Batch 19 promotes that boundary without creating a second Piece model.

## Preserved v1.5.99 concepts

- Slab surfaces belong to a Layout.
- A slab has a real width, height, X/Y position, visibility, opacity, and optional
  material/image payload.
- Historical slabCW, slabCH, and ovSel values continue to migrate through the
  Layout compatibility extra bag.
- Project/editor preferences remain the owner of default slab dimensions,
  slabCutClearance, slabEdgeAllowance, and slab-material visibility.
- The same countertop Piece is used in both workspaces. DESIGN geometry is not
  duplicated when nesting in SLAB.
- SLAB Piece movement remains independent even when the same Pieces form a
  fabrication Assembly in DESIGN.

## Typed slab domain

src/domain/slabs/index.ts now owns the compatibility-safe slab surface model.

The canonical surface includes:

- id
- name
- width / height
- X / Y placement
- opacity
- visibility

Unknown historical image/material fields remain preserved as JSON. A single
slabSurfaceImageSource() selector resolves the legacy image-source variants instead
of spreading those compatibility checks through rendering code.

The domain also owns:

- normalization
- blank-slab creation
- physical slab bounds
- usable cut bounds after edge allowance

Layout.overlays is now SlabSurface[] rather than an anonymous PersistedEntity[].

## Commands

Slab mutation now goes through AppStore commands:

- addSlabSurface()
- updateSlabSurface()
- deleteSlabSurface()

These commands are valid only for the active Layout while the SLAB workspace is
active.

Each edit is therefore:

**one command → one history entry → one autosave path → normal invalidation**

Adding a slab selects it. Deleting the selected slab clears that selection.

## SLAB projection

The Piece canvas projection now includes a read-only slab projection in SLAB:

- physical bounds
- usable bounds
- visibility
- opacity
- selected state
- optional resolved material image

Visible slab extents participate in SLAB canvas sizing alongside Piece fabrication
placements and the migrated explicit slabCW / slabCH canvas values.

The browser surface renders slabs below Pieces and supports slab hit testing without
changing Piece hit-testing precedence.

## Inspector / harness

The architecture harness now exposes:

- + Blank Slab
- slab material visibility
- slab selection
- slab Inspector name
- width / height
- X / Y
- opacity
- visibility
- delete

Blank slabs use the existing editor default slab dimensions.

This is intentionally an architecture validation surface rather than a final
production-styled SLAB Navigator.

## Nesting and snapping

Batch 13 deferred raw slab edge-allowance snapping. Batch 19 closes that item.

When Object Snap is enabled in SLAB:

1. the slab's physical bounds are inset by slabEdgeAllowance
2. those usable edges become highest-priority smart-snap references
3. Piece-to-Piece slabCutClearance remains a separate nesting rule
4. grid snap remains the lowest-priority fallback
5. Alt continues to bypass snapping through the existing Piece interaction path

This keeps two fabrication concepts distinct:

- **edge allowance** = keep a Piece inset from the raw slab perimeter
- **cut clearance** = keep nested Pieces separated from one another

## Tests

tests/slab-workspace.test.ts covers:

- v1.5.99 overlay migration into typed slab surfaces
- preservation of historical Layout slab canvas metadata
- usable-bound calculation
- legacy image-source compatibility
- add / edit / select / delete commands
- DESIGN-workspace mutation guards
- read-only SLAB projection and slab hit testing
- Piece snapping to a slab's usable edge

The pre-existing Piece interaction tests continue to cover independent SLAB poses and
Piece-to-Piece fabrication-clearance snapping.

## Deliberate boundaries

This batch does not yet migrate every production SLAB feature.

Still deferred:

- direct pointer dragging/resizing of slab surfaces
- slab inventory/material catalog ownership
- multi-slab Navigator/list UX
- slab-image upload/library workflows
- slab contrast presentation modes
- persistence cleanup that removes the historical extra compatibility fields

Those can now be added against a typed slab API instead of generic overlay records.

## Next batch

The next coherent migration slice is **Batch 20 — Annotation foundation**:

1. manual Dimensions
2. Lines
3. Notes and Note leaders

Those are already Layout-owned domains and can now move onto the same
command / interaction / projection architecture used by Pieces and SLAB.
