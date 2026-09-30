# Batch 20 — Annotation foundation

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: cd50b4525294946e9f033e918f4e910a211d8f59

## Scope

Batch 20 promotes the remaining Layout-owned drawing annotations into typed
architecture domains:

- manual Dimensions
- Lines
- Notes
- Note leaders

The batch establishes ownership, persistence, command transactions, DESIGN canvas
projection, selection, and Inspector editing. Advanced drag handles and production
snap/inference behavior remain a later interaction slice.

## Typed annotation domain

`src/domain/annotations/index.ts` owns canonical annotation normalization.

Manual Dimensions retain:

- id / name
- exact start and end coordinates
- screen-space offset in pixels

Lines retain:

- endpoints
- solid / dashed style
- color
- thickness
- start and end caps
- optional typed Note attachment

Notes retain:

- position and text
- font size
- inferred/explicit bold compatibility
- italic / alignment / color / halo
- rotation

Unknown historical annotation metadata remains preserved as JSON so specialized
v1.5.99 annotations such as radius-label metadata are not discarded.

## Note leader relationship

A Note leader is not a separate annotation type. It is an ordinary typed Line with:

- `attachedNoteId`
- `attachedEnd`

Moving a Note synchronizes every attached leader endpoint in the same command.
Deleting a Note removes all of its attached leader Lines atomically. Leaders can
also be removed without deleting the Note.

This replaces historical cross-object mutation with one explicit relationship.

## Commands

Batch 20 adds command ownership for:

- add / update / delete Dimension
- add / update / delete Line
- add / update / delete Note
- add Note leader
- remove Note leaders

All annotation mutation is DESIGN-only and follows the shared AppStore history /
autosave path.

## Canvas projection

`src/browser/annotation-canvas-model.ts` projects annotations only in DESIGN.

The projection:

- converts Dimension `offsetPx` through the current canvas scale
- derives Dimension display endpoints and exact physical length
- projects Line and Note styling
- derives selected state from the shared application Selection
- supplies screen-tolerance hit testing for Dimension, Line, and Note selection

The browser surface renders the annotation layer above Piece geometry and routes
annotation hits through the same typed Selection union used by the rest of v1.6.

SLAB intentionally projects no manual annotations.

## Inspector

Selected annotations receive first-class Inspector contexts.

Dimension Inspector:
- name
- start / end coordinates
- offset
- delete

Line Inspector:
- name
- endpoints
- thickness
- solid / dashed style
- start / end caps
- color
- delete

Note Inspector:
- text
- X / Y
- font size
- rotation
- alignment
- color
- bold / italic / halo
- remove leader(s)
- delete

Every edit dispatches one annotation command rather than mutating browser state.

## Persistence

Layout `dims`, `lines`, and `notes` now normalize through their typed domain
normalizers, including Piece-graph migration paths used by fabrication operations.
This keeps annotation metadata intact when Layout/Piece graphs are reconstructed.

## Tests

Coverage includes:

- v1.5.99 Dimension and Note migration
- unknown annotation metadata preservation
- inferred-bold compatibility
- typed Note leader normalization
- add/update/delete command ownership
- Note movement synchronizing leaders
- Note deletion removing leaders atomically
- DESIGN-only mutation guards
- Piece graph annotation normalization
- DESIGN-only canvas projection
- Dimension pixel-offset conversion
- shared Selection projection
- annotation hit-test precedence

## Deliberate boundary

This batch does not yet migrate the full production annotation interaction layer:

- endpoint drag editing
- Dimension label dragging
- Shift straightening
- H/V inference and alignment guides
- live tool previews
- zero-length guards during pointer creation
- annotation Navigator lists / inline rename
- advanced arrowhead geometry and production cap trimming

Those behaviors now have a typed domain, transaction API, and projection surface to
target without reintroducing direct DOM mutation.

## Next batch

The next coherent slice should be **Batch 21 — Annotation interactions**: wire the
existing Dimension / Line / Note tool definitions to typed pointer handlers,
production snapping/inference, endpoint editing, label offset dragging, keyboard
delete, and Navigator list behavior.
