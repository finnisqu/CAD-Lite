# Batch 52 — Production Inspector Integration

Status: complete

Starting architecture head: `387d63927db3e2bfe4a47b58903c3aa0dd6511df`

Validated implementation head: `36822e80ae56e00dc6511900f9afa9bec8b58008`

## Goal

Restore production-quality right-side Inspector presentation around the already-migrated typed v1.6 Inspector controls, including the collapsible behavior that was part of the v1.5.99 production workflow, without moving CAD mutation ownership back into shell code.

## Re-audit of the initial Inspector work

The first Inspector integration commits were made while the conversation had briefly fallen into Instant mode. A deliberate re-audit found that those commits were presentation-only and structurally safe: they added a shell-scoped Inspector stylesheet and loaded it through the v1.6 entry point, without changing domain state, commands, project lifecycle, history, or typed Inspector mutations.

However, that first pass was incomplete for the stated Batch 52 goal. It improved hierarchy, spacing, field layout, fabrication cards, action rows, and Scratchpad presentation, but it did not restore the production Inspector's collapsible section behavior.

The missing behavior was therefore added before Batch 52 was accepted.

## v1.5.99 behavior checked directly

The production v1.5.99 source uses an exclusive Piece Inspector accordion. Its section state includes:

- Piece Info — open by default
- Appearance
- Overhangs
- Splashes
- Sinks
- Cutouts
- Seams
- Edges & Corners / edge options

Production uses `setExclusiveInspectorSection(...)` semantics: opening one Piece section closes the others. Section headers update their open class, body visibility, arrow state, and `aria-expanded` value.

That behavior is part of the production interaction contract rather than merely visual styling.

## Current typed v1.6 Inspector capability

The architecture branch does not yet expose every v1.5.99 Piece Inspector section. The currently migrated typed Piece Inspector provides real controls for:

- Piece Info
  - name
  - width
  - height
  - DESIGN / SLAB rotation
- Sinks
- Cutouts
- Seams
- Fabrication Seams when applicable
- Mirror H / Mirror V
- Area assignment
- Duplicate
- Delete

Other typed Inspector contexts already exist for:

- Layout
- Area
- Material / Selection
- Piece Group / Fabrication Assembly
- Dimension
- Line
- Note
- Room Feature / Wall
- Slab

Batch 52 restores production chrome only around controls that actually exist. It does not create inert or misleading headings for unmigrated Piece controls.

## Production Inspector styling

Added:

`src/styles/production-inspector.css`

The stylesheet is fully scoped beneath `.cad-lite-production-shell`, so the architecture harness remains visually independent.

It provides production-oriented presentation for:

- Inspector context headings
- compact form controls
- two-column property grids where appropriate
- Material / Selection Inspector
- Piece Group / Assembly summary and actions
- Piece geometry
- Sinks and faucet controls
- Cutouts
- Piece Seams
- Fabrication Seams
- annotation Inspectors
- Room Feature / Wall Inspector
- Slab Inspector
- destructive actions
- mirror / Piece actions
- Scratchpad docked and floating presentation
- responsive Inspector behavior

The styling does not perform CAD mutations.

## Production-only Inspector accordion

Added:

`src/browser/production-inspector-surface.ts`

This surface is intentionally a browser-shell decorator rather than a replacement Inspector implementation.

It:

- no-ops unless the production shell is present
- observes the typed `#lc-inspector` mount because the underlying Inspector DOM is regenerated as selection changes
- uses delegated click and keyboard handling
- adds `role`, `tabindex`, `aria-expanded`, arrow state, and body visibility
- leaves the existing typed command handlers on the controls themselves
- does not own project/domain state

### Piece Inspector

The production surface restores exclusive accordion behavior for the sections that actually exist today:

- Piece Info
- Sinks
- Cutouts
- Seams
- Fabrication Seams

Piece Info is open initially. Selecting another section opens it exclusively. Selecting the already-open section can collapse it so all sections are closed.

Buttons nested in a section heading, such as Sink centerline visibility, remain independently clickable and do not accidentally toggle the accordion.

### Other Inspector contexts

Typed context headings for Layout, Area, Material / Selection, Piece Group, annotations, Room Features, and Slabs are given simple collapsible presentation without changing their underlying behavior.

## Architecture separation

The re-audit deliberately avoided modifying `ProjectLayoutSurface` simply to make production shell chrome work.

The typed Inspector remains authoritative for:

- which controls exist
- values shown
- CAD commands
- selection behavior
- history
- persistence

`ProductionInspectorSurface` owns only production-shell presentation and collapse state.

That keeps the architecture harness usable and avoids rebuilding a second Inspector mutation path.

## Small shell parser correction

During the broader re-audit, the Navigator collapse-state parser in `ProductionShellSurface` was tightened so the result of `JSON.parse()` is explicitly treated as `unknown` before narrowing to a string array.

This was a type/lint hardening cleanup only; it did not alter CAD behavior.

## Tests

Added:

`tests/production-inspector-surface.test.ts`

Coverage verifies the pure exclusive-section state transition used by the production Piece Inspector:

- opening another section replaces the current section
- selecting the current section collapses it
- a section can be opened from the fully collapsed state

Existing domain, interaction, lifecycle, Navigator, selection, history, persistence, and rendering tests remain in the same CI suite.

## Validation

Architecture CI run: `36910588465`

Quality job: `110531945968`

Result: success.

Validated:

- TypeScript typecheck
- lint
- 337 / 337 tests across 49 files
- production build
- browser-ready artifact verification

Artifacts:

- JS: 365.25 kB / 90.80 kB gzip
- CSS: 62.59 kB / 9.09 kB gzip

The CSS increase is expected because Batch 52 adds the production Inspector skin and accordion chrome while retaining the architecture styles during integration.

## Explicit remaining Inspector parity gaps

The following v1.5.99 Piece Inspector sections are not yet represented by equivalent typed v1.6 controls and therefore were not faked in Batch 52:

- Appearance
- Overhangs
- Splashes
- Edges & Corners / edge profiles

These are real production-parity gaps to address in focused follow-up slices or explicitly approve as changed behavior before v1.6 cutover.

Final Inspector acceptance also still requires side-by-side visual QC in light and dark mode.

## Production safety

Production `main` remains frozen at v1.5.99.

No production v1.5.99 artifact was modified in this batch.

## Recommended next batch

Batch 53 should move to **Production Viewport and Canvas Controls** rather than continuing to expand shell CSS indefinitely.

The next focused slice should audit and migrate the remaining real v1.5.99 canvas-shell capabilities, especially:

- Zoom + / − and production zoom behavior
- Reset / fit behavior where still applicable
- Fullscreen
- Theater mode
- canvas size / grid controls that still belong in VIEW
- light / dark appearance behavior
- workspace-specific presentation around DESIGN / SLAB

Missing Piece Inspector capabilities remain tracked separately and should be implemented as real typed functionality rather than placeholder sections.
