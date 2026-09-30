# Batch 21 — Annotation interactions

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: 2a8b40fbc013e5d200c5aae248ad23a64f53f992

## Scope

Batch 20 established typed annotation ownership, command transactions, DESIGN
projection, selection, and Inspector editing. Batch 21 connects that foundation to
the existing Dimension / Line / Note tool architecture.

This slice migrates annotation **creation** and the most important keyboard lifecycle
without mixing in endpoint editing yet.

## Tool handlers

`src/app/interaction/annotations.ts` registers typed handlers for:

- Dimension (D)
- Line (L)
- Note (N)

The existing ToolController still owns activation semantics:

- hold D/L/N for momentary use
- Shift+D/L/N toggles a locked tool
- Escape cancels
- Enter dismisses these tools through their existing definitions

The browser runtime now registers these handlers during mount and unregisters them on
destroy.

## Dimension and Line creation

Dimension and Line creation use a shared segment interaction:

1. pointer-down captures the snapped start point
2. pointer-move writes a transient typed preview
3. pointer-up resolves the final endpoint
4. zero-length segments are rejected
5. one domain command is committed through the CommandDispatcher

The interaction preview lives only in Session interaction state. No partial
annotation is written to the Layout before pointer-up.

### Snapping

Creation preserves the architecture's snap priority:

- Alt bypasses snapping
- Piece/Object Snap checks rotated Piece corners and edge midpoints using a
  screen-space tolerance
- Grid Snap is the fallback
- raw precision is retained when no snap wins

Holding Shift constrains the second endpoint horizontally or vertically from the
captured start point.

## Note creation

The Note tool creates one typed Note at the resolved pointer location and selects it.
The default text is `Note`; the first-class Note Inspector from Batch 20 owns
subsequent text and style editing.

## Browser surface

The Piece canvas now routes pointer input to ToolController whenever a tool is active,
before normal Piece selection/movement.

The surface renders the transient Dimension/Line segment as a dashed blue preview.

The development harness exposes explicit:

- Dimension (D)
- Line (L)
- Note (N)

buttons in addition to keyboard activation. Their pressed state is derived from
ToolController, not duplicated UI state.

## Keyboard delete

When no text field is being edited, Delete / Backspace removes the selected:

- Dimension
- Line
- Note

through the typed annotation delete commands. Note deletion continues to remove its
attached leaders atomically.

## Tests

Batch 21 adds focused interaction coverage for:

- Dimension creation through ToolController
- Shift horizontal/vertical constraint behavior
- zero-length Line rejection
- Note creation and selection
- DESIGN-only activation guard

The pre-existing ToolController tests continue to cover held versus locked tool
activation and cancellation semantics.

## Deliberate boundary

Still deferred to the next annotation interaction slice:

- dragging Dimension endpoints
- dragging Dimension number/offset
- dragging Line endpoints
- moving Notes directly on canvas
- endpoint Shift straightening for existing entities
- H/V inference without Shift
- dotted alignment guides / snap marker
- annotation Navigator lists, rename, show/hide
- production arrowhead trimming and detailed cap rendering

Those can now operate against typed annotation entities and commands rather than
legacy direct mutations.

## Next batch

The next coherent slice is **Batch 22 — Annotation editing interactions**: migrate
existing-annotation endpoint/offset dragging, H/V inference, Shift straightening,
alignment guides, snap marker, and the annotation Navigator/list behaviors.
