# Batch 10 — Typed Piece foundation

Baseline audited: production `cad-lite-v1.5.99.js` at
`77728eed327f144b0b1c5d4b9562747d8d62074e`.
Architecture starting point: `740f5bb422c8fc02fab58ad3fe779d2cea8b167a`.
Production files and main are intentionally untouched.

## Audit findings

| Concern | v1.5.99 source / behavior | Batch 10 boundary |
| --- | --- | --- |
| Identity/order | Add handler around 25887: id, name, layer; array order also drives Navigator | Typed identity and layer; no reorder UI yet |
| Rectangle geometry | w/h are unrotated dimensions; x/y are DESIGN bounding-box origin, rotation separate; realSize around 15196 | Typed flat storage retained; pieceGeometry returns a discriminated rectangle shape, piecePose supplies workspace pose |
| Default creation | 40 × 25.5, white, top layer, active/preferred Area, 4-inch splash clearance plus two grid steps | Factory accepts explicit ID and Area; harness uses active Area, no pointer/hover placement yet |
| Corners | cornerRadii plus redundant rTL/rTR/rBR/rBL; migratePieceGeometry around 15772 | Canonical numeric corner radii; old booleans consumed at import, not retained as a second source of truth |
| Fabrication | edgeProfiles, overhangs, sinks, cutouts, pieceSeams | Typed collections and IDs; detailed child payloads remain JSON-compatible until their own batches |
| Relationships | pieceGroupId/name, assemblyLinks, attachment | Separate group and physical seam services; typed link endpoints |
| Splashes | pieceType, tags, splashKind, splashHeight; attachment includes parentPieceId, sourceEdge, linkedLength, snapped, offset | Parent relationship typed; remaining attachment detail preserved |
| Presentation | color, noFill, fillOpacity; dimensions/labels/format predominantly global preferences | Safe appearance command; no invented per-Piece preference ownership |
| SLAB | slabPlacement x/y/rotation, independent of DESIGN; slab membership derived spatially | Typed pose, no invented slab ID |
| Material/visibility/locking | Audited lifecycle does not establish these as canonical Piece fields | No new behavior; unknown imported fields preserved under legacy |
| Compatibility | Whole Piece objects persisted in project snapshots; single-layout import is a narrower older path | normalizePieces is the boundary; canonical round-trip is idempotent |

Important source locations: group/Assembly logic 5571–5806; keyboard Delete
6282–6318; clipboard 6431–6702; Ctrl+D Piece path 6925–7021; SLAB pose
14000–14034; fabrication expansion 16116–16124; radius annotation cleanup
21099 onward; factory 25887 onward. The old standalone duplicatePiece helper
is not a sufficient specification for Ctrl+D or copy/paste.

## Model decision

Layout.pieces is now Piece[], not PersistedEntity[]. Piece has no arbitrary
index signature. Unknown fields are explicitly separated into legacy.

This batch deliberately does not change rectangle rendering or introduce polygon
editing. pieceGeometry exposes a shape discriminator and local dimensions/corners;
piecePose separates DESIGN/SLAB placement. The rectangle-era storage fields remain
flat behind those accessors. There is no duplicate geometry object to drift out of
sync. A later geometry schema migration can replace this adapter.

No display formatting or rounding is applied by structural commands. Detailed
child normalization (e.g. sink model dimensions, overhang proportional fitting,
edge-profile enumerations) remains for fabrication/edge batches. Existing child
payloads are preserved, not silently reinterpreted.

Schema v1 is still the architecture-development envelope; its normalizer accepts
both the prior generic Piece records and the new typed records. Main's save format
and runtime are not changed.

## Lifecycle rules

- DESIGN delete/duplicate expands the fabrication seam graph, then linked splash
  descendants, including unsnapped children.
- SLAB delete/duplicate starts with only requested Pieces, then splash descendants.
- Selecting only a splash does not promote deletion/duplication to its parent.
- Ordinary groups are not automatically expanded by delete/duplicate. Removing a
  member dissolves singleton group metadata; Area assignment still moves the group.
- Deleting a Piece removes its owned sinks/cutouts/seams and SLAB pose by ownership.
- Surviving assemblyLinks to deleted Pieces are removed in SLAB.
- Radius notes referencing removed Pieces and their leaders are removed explicitly.
  Production performs this cleanup from syncRadiusAnnotations during drawing.
  Independent notes, dimensions, lines and slab overlays survive.
- Selection is sanitized in the same command. Area/Layout navigation is preserved.
- Active Area restoration was corrected in History: a valid current Area wins over
  snapshot navigation, matching its skip-history policy.

Malformed imports get deterministic collision-safe Piece IDs, missing Areas fall
back to the first Area, missing/cyclic splash attachments detach, and dangling or
self seam links drop. One-sided existing seam relationships are reported by
validation and traversed undirectionally for lifecycle safety. We do not generate
new group IDs while normalizing malformed assemblies: group reconstruction remains
a later explicit graph operation.

## Duplication boundary

preparePieceDuplication runs before dispatch with a caller-owned ID factory.
It allocates Piece, complete-group, seam, assembly-link, sink, cutout, split-sink
and split-cutout identities. Shared link/split identities remain shared within the
copy; mate and parent references point to copied Pieces only. A partial ordinary
group detaches. A lone copied splash becomes standalone. An explicit source
signature prevents dispatching a prepared graph against a changed Layout.

This is same-layout structural duplication. It follows Ctrl+D family and offset
rules while fixing its incomplete remapping using the more complete clipboard path.
Cross-layout clipboard UI, attached annotation duplication, arbitrary legacy
extension reference remapping, and full Layout graph duplication are deferred.
Layout duplication continues to preserve nested IDs as agreed in Batch 9.

## Commands and harness

Add, rename, delete, duplicate, appearance updates and existing Area assignment:
history record, persistence save. Selection stays skip/skip through the existing
selection command. IDs are never allocated inside reducers.

The harness adds a Piece list, Add, selection (Ctrl/Command additive), a minimal
name/Area Inspector, Duplicate and Delete. It remains an architecture surface, not
a production Inspector or canvas replacement. No pointer gestures are migrated.

## Validation

26 new regression tests cover factory independence/defaults, deterministic commands,
cascade rules in both workspaces, ordinary groups vs fabrication assemblies,
radius cleanup, selection, all known graph ID remaps, stale plans, precision,
malformed compatibility data, history/Area/metadata, autosave and round-trip.
Existing typed test fixtures were updated without removing assertions.

Run the unchanged Architecture CI gate (strict TypeScript, ESLint, all Vitest
suites, Vite build and browser artifact existence checks). Browser interaction
checks remain manual; no browser automation result is claimed.

## Next batch

Piece geometry/rendering is the default next slice: consume pieceGeometry and
piecePose in a read-only canvas projection, protecting rotated bounds, corners and
precision before pointer interactions. Then Piece interactions, fabrication child
entities, edges/splashes, groups/assemblies, SLAB, annotations, room/plan context,
persistence cleanup, production cutover. This order is directional; repo audits
may justify dependency-driven adjustments.
