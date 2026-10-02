# Batch 56 — Radius Labels + Edge Painter

Status: complete

Starting architecture head: `db354fba9e1fbf144859b419bd1fdf41326a7acb`

Validated implementation head: `e2964702c1d6814902b882af4627cae434a5c80d`

## Goal

Restore the production v1.5.99 Radius Labels and Edge Painter workflows on top of the typed v1.6 architecture without introducing a second geometry / mutation system inside the production shell.

The production audit exposed an important ownership distinction:

1. Radius Labels are specialized Note + Line annotation relationships that follow Piece / Sink geometry.
2. Edge Painter is a mode interaction over the already-typed Piece edge-profile mutation command.

They share the common ToolController / floating-HUD lifecycle, but they do not share domain ownership.

## v1.5.99 Radius Label contract

The frozen production source established that Radius Labels are not Piece properties.

A Radius Label is represented by:

- a normal Note
- an attached leader Line
- `annotationType: 'radius'`
- `radiusRef` pointing to either a Piece corner or Sink corner
- automatic text while `autoText !== false`
- a remembered geometry target used to translate / re-pin the annotation as the source geometry changes

Production behavior includes:

- Piece-corner radius labels
- rectangular Sink-corner radius labels
- zero-radius / oval Sink targets excluded
- duplicate prevention per source corner
- Add / Erase brush behavior
- Selected Piece / All Pieces scope
- Outside / Inside placement
- `R` momentary activation
- `Shift+R` lock / unlock
- Enter / Escape dismissal through the mode lifecycle
- blank-canvas dismissal
- a draggable floating HUD
- placement preference stored at `litecad:radiusLabelPlacement`
- manual Note text edits disable automatic radius text updates
- invalid / deleted source geometry removes the dependent Radius annotation

### Production target geometry

The production target is not the raw rectangle corner.

For each nonzero corner radius, the leader targets the 45-degree point on the actual radius arc. In local coordinates the offset uses:

`radius / Math.SQRT2`

The target and outward bisector are then rotated with the Piece or Sink geometry.

The default Note position is 10 inches along the outward bisector. Inside placement reverses that direction. The position is clamped to the DESIGN canvas, with the production fallback that flips to the opposite side if clipping would leave the Note effectively stacked on the radius target.

## Typed Radius annotation relationship

Added:

`src/domain/annotations/radius.ts`

This domain module owns the relationship model and pure projection / synchronization behavior.

It includes typed support for:

- Piece and Sink radius references
- valid corner normalization
- resolving a Radius reference back to current geometry
- Piece / Sink target and outward-vector calculation
- Inside / Outside Note placement
- production radius-label lookup
- dependent annotation synchronization
- cleanup when source Piece / Sink / radius geometry no longer exists

The existing Note and DrawingLine models continue to own the visible annotation entities. No parallel Radius-label entity collection was added.

## Radius commands

Added:

`src/app/commands/radius-annotations.ts`

Radius creation / deletion is an atomic typed command transaction.

Creation writes the production-compatible Note + attached leader pair while preserving the source Piece as the active CAD selection rather than switching the user into generic Note editing.

Deletion removes the dependent Note / leader relationship together.

The normal annotation command path was extended so a manual Radius Note text edit marks the reference as no longer auto-text-controlled, preserving the production behavior.

## Command invariants

Added:

`src/app/command-invariants.ts`

The command dispatcher now runs geometry-dependent relationship synchronization as part of the same command result that changed the source geometry.

Radius annotation synchronization therefore follows ordinary typed commands such as:

- Piece move / rotation
- Piece resize
- corner-radius edit
- Sink edit / movement / rotation
- source deletion
- dimension-format / precision changes affecting automatic Radius text

This avoids a renderer-only or production-shell-only repair pass and keeps persisted/history state internally consistent.

## Radius formatting

Added:

`src/core/format-inches.ts`

Automatic Radius text uses the same application dimension-format and precision preferences instead of hard-coding a second formatting vocabulary.

## Radius tool interaction

Added:

`src/app/interaction/radius.ts`

The implementation reuses the existing `ToolController` definition for `radius`:

- DESIGN-only
- momentary-lockable
- shortcut `R`
- default scope `all`
- Enter dismissal

The typed handler owns:

- eligible Piece / Sink corner targets
- production arc hit regions
- Selected / All scope
- Add / Erase
- Inside / Outside placement option
- duplicate-label behavior
- blank-click dismissal
- keeping the mode active for clicks inside eligible parent geometry

The handler emits typed Radius annotation commands; it does not mutate Notes / Lines directly.

## Production Radius HUD / targets

Added:

`src/browser/production-radius-surface.ts`

Added:

`src/styles/production-radius.css`

The production-shell surface owns presentation only:

- draggable RADIUS LABELS HUD
- lock / close controls
- Scope: Selected Piece / All Pieces
- Brush: Add / Erase
- Placement: Outside / Inside
- selected-scope warning
- clipped HELP copy with full hover tooltip
- production canvas radius target overlays

The surface is mounted in the browser runtime and the Radius tool handler is registered with the shared ToolController.

## Edge Painter production contract

The v1.5.99 behavior audit established:

- `E` momentary activation
- `Shift+E` lock / unlock
- DESIGN-only
- default scope All Pieces
- Selected Piece / All Pieces scope
- Paint / Erase brush
- default paint profile `quarter`
- remembered profile at `litecad:edgePainterProfile`
- profile selector disabled while erasing
- erase means setting the physical edge back to `flat`
- blank-canvas dismissal
- interior Piece clicks do not accidentally dismiss the tool
- production profile vocabulary:
  - Flat
  - Quarter
  - Bevel
  - Half bull
  - Full bull
  - Ogee
  - Miter
  - Seam

## Edge Painter mutation ownership

No new Piece edge mutation command was needed.

The existing:

`updatePieceEdgeProperties(...)`

remains authoritative for edge-profile changes.

That command already participates in linked-Splash miter synchronization, so Edge Painter automatically preserves the relationship work completed in Batch 55.

## Edge Painter tool interaction

Added:

`src/app/interaction/edge-painter.ts`

The typed handler owns:

- rotated physical Piece-edge projection
- pixel-space edge hit tolerance converted through the active Layout scale
- exclusion of linked backsplash children from parent countertop targets
- Selected Piece / All Pieces scope
- Paint profile option
- Erase-to-flat behavior
- blank-click dismissal
- keeping the mode alive when clicking inside eligible Piece geometry away from an edge

All mutations are emitted through `updatePieceEdgeProperties(...)`.

## Production Edge Painter HUD / targets

Added:

`src/browser/production-edge-painter-surface.ts`

Added:

`src/styles/production-edge-painter.css`

The production surface owns:

- draggable EDGE PAINTER HUD
- lock / close controls
- Scope: Selected Piece / All Pieces
- Brush: Paint / Erase
- profile selector
- remembered profile via production localStorage key
- selected-scope warning
- clipped HELP copy with full hover tooltip
- presentation-only SVG physical-edge targets
- danger styling for Erase mode

The visual target layer does not mutate Piece state. Pointer resolution remains owned by `PieceCanvasSurface → ToolController → Edge Painter handler`.

## Runtime integration

`src/browser/runtime.ts` now:

- registers the Radius tool handler
- registers the Edge Painter tool handler
- mounts / unmounts `ProductionRadiusSurface`
- mounts / unmounts `ProductionEdgePainterSurface`
- exposes both surfaces through the runtime interface

`src/browser/index.ts` exports the two production surfaces.

`src/main.ts` loads their production-shell-scoped stylesheets.

## Annotation rendering / visibility hardening

The annotation canvas projection was updated so Radius Notes / leaders remain ordinary annotation entities while respecting their specialized relationship metadata.

Radius visibility tests cover dependent annotation behavior rather than adding special renderer-owned source state.

## Tests

Added / expanded coverage includes:

`tests/radius-annotations.test.ts`

- Piece target geometry
- Sink target geometry
- Inside / Outside placement
- Note + leader construction
- duplicate prevention
- automatic synchronization
- manual-text preservation
- invalid source cleanup

`tests/radius-tool.test.ts`

- common ToolController Radius flow
- scope behavior
- Add / Erase interaction
- production placement options / lifecycle

`tests/radius-annotation-visibility.test.ts`

- dependent Radius annotation visibility / cleanup behavior

`tests/edge-painter-tool.test.ts`

- Paint through ToolController
- Erase-to-flat through ToolController
- Selected Piece scope requires exactly one Piece
- All / Selected target projection
- rotated physical-edge targeting
- Piece-interior click retention
- blank-canvas exit
- remembered profile normalization

The existing Piece edge-property tests continue to cover the authoritative typed mutation layer and linked-Splash miter behavior remains owned there.

## Final validation

Validated implementation head:

`e2964702c1d6814902b882af4627cae434a5c80d`

Architecture CI run:

`36945052769`

Quality job:

`110645138547`

Result: success.

Validated:

- TypeScript typecheck
- lint
- 389 / 389 tests across 62 files
- production build
- browser-ready artifact verification

Artifacts:

- JS: 430.22 kB / 105.56 kB gzip
- CSS: 80.90 kB / 10.89 kB gzip

## Ownership / architecture result

Final ownership remains explicit:

### Radius Labels

- Radius source / target geometry: annotation domain
- dependent Note + leader relationship: annotation domain
- creation / removal / history / persistence: typed Radius commands
- geometry-change synchronization: command invariant boundary
- mode lifecycle / shortcut / scope / options: shared ToolController
- corner hit resolution: typed Radius handler
- HUD / visual targets: production browser surface

### Edge Painter

- edge-profile data: typed Piece model
- edge-profile mutation and linked-miter synchronization: existing typed Piece edge command
- mode lifecycle / shortcut / scope / options: shared ToolController
- physical-edge target / hit resolution: typed Edge Painter handler
- HUD / visual targets: production browser surface

Neither production surface directly mutates CAD domain state.

## Production safety

Production `main` remains intentionally frozen at the v1.5.99 checkpoint and was not modified by this batch.

The production SHA is verified separately after the documentation commit before advancing to the next batch.

## Recommended next batch

Batch 57 should be a remaining Piece / Fabrication interaction parity audit rather than immediately adding another large workflow.

Re-audit the frozen v1.5.99 behavior against the current production shell for the remaining high-value gaps around:

- Piece selection / multi-selection interaction
- Sinks / Cutouts / Seams interaction parity
- fabrication seam actions
- Piece labels / dimensions
- annotation selection interaction
- any remaining Inspector action gaps
- DESIGN / SLAB cross-workspace behavior

Choose focused fixes from that audit and CI-gate them in small slices before moving on to the Floor Plan production-presentation batch.
