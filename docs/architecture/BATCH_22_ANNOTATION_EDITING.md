# Batch 22 — Annotation editing interactions

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: c4649caf75c633cb68ebd714180c23480ab3f998

## Scope

Batch 22 completes the first editing layer for typed manual Dimensions, Lines, and
Notes. Batch 20 established ownership/projection/Inspector behavior and Batch 21
migrated creation tools; this batch adds direct manipulation of existing annotations
without returning to live domain mutation.

## Preview → commit editing

Annotation editing now uses `AnnotationInteractionController`.

Pointer movement writes only a transient `annotation-edit` preview into Session
interaction state. The Layout is not mutated until pointer-up.

Pointer-up commits one typed annotation command plus interaction cleanup as one
transaction, so endpoint moves, label-offset moves, and Note moves are:

**one gesture → one deterministic command transaction → one Undo step → one autosave**

Escape/pointer cancel discards the preview and leaves persisted geometry unchanged.

## Dimension editing

A selected Dimension exposes:

- start endpoint handle
- end endpoint handle
- draggable number/offset handle

Endpoint editing preserves exact coordinates and uses the same snapping resolver as
new Dimension creation.

Straightening behavior matches the established CAD Lite interaction:

- normal dragging has weak 3° H/V inference
- Shift forces strong H/V constraint
- Alt bypasses snapping
- zero-length endpoint results are rejected

Dragging the Dimension number writes a signed perpendicular `offsetPx` value. The
stored offset therefore stays screen-relative as in v1.5.99 instead of becoming a
fabrication measurement.

## Line editing

Selected Lines expose independent start/end endpoint handles.

The same snapping and straightening rules apply:

- object / grid snapping
- Alt bypass
- 3° weak H/V inference
- Shift strong H/V constraint

For Note leaders, the endpoint attached to the Note is locked. The free leader end
remains editable.

## Note editing

A selected Note can be dragged directly from its text.

Moving a Note previews attached leader geometry with it. On commit,
`updateCanvasNote()` remains the authority and synchronizes every attached leader
atomically.

## Alignment guides and snap marker

Existing-annotation endpoint editing now projects:

- dotted vertical/horizontal alignment guides
- a snap marker for resolved Piece/Grid snap points
- annotation-axis alignment against other Dimension endpoints, Line endpoints, and
  Note anchors

Piece/object snapping retains priority over annotation-axis alignment. Grid remains
the fallback. Alt bypasses these snap behaviors.

## Typed visibility

Dimensions, Lines, and Notes now carry canonical `visible` state, defaulting to
true during migration.

Canvas projection combines entity visibility with the existing global preferences:

- `showManualDims`
- `showLines`
- `showNotes`

This makes visibility a typed persisted concern rather than UI-only state.

## Navigator

The DESIGN Navigator now includes first-class:

- Dimensions
- Lines
- Notes

sections.

Each section exposes its global show/hide preference. Each entity row supports:

- selection
- inline rename/text edit
- individual show/hide
- delete

The same typed commands used by Inspector and canvas editing own these list actions.

## Tests

Batch 22 adds coverage for:

- 3° weak straightening on existing Dimension endpoints
- Shift strong H/V endpoint constraint
- signed screen-pixel Dimension label offset
- Note drag with attached leader synchronization
- locked Note-side leader endpoint
- cancellable preview with no Layout mutation
- typed annotation visibility in canvas projection

## Deliberate boundary

Still deferred:

- dragging an entire Line as one object
- dedicated Dimension endpoint inference against arbitrary Piece edge projections
- richer production arrowhead trimming/cap geometry
- multi-select annotations
- annotation Ctrl+D behavior
- non-popup inline numeric canvas edit for Dimension length

The architecture now supports those as incremental interaction features rather than
cross-domain rewrites.

## Next batch

The next coherent migration slice should move to the remaining DESIGN-owned
environment domains, starting with **Room Features / Walls**, unless QC of the
annotation editing harness reveals a smaller high-confidence annotation parity gap.
