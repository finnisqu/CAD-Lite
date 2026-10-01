# Batch 51 — Production Navigator Integration

Status: complete

Starting architecture head: `6e959360237168da38f35ca4936f24d1c403b3cc`

Validated implementation head: `387d63927db3e2bfe4a47b58903c3aa0dd6511df`

## Goal

Restore the production left-side Navigator around the already-migrated typed v1.6 browser/domain surfaces. The goal of this batch was exposure and production chrome, not reimplementation of Project, Layout, Material, Piece, annotation, Room Feature, Floor Plan, or Slab behavior.

## Static production Navigator hierarchy

`dev/production-shell.html` now provides dedicated collapsible production-shell sections for:

- Project
- Layouts
- Selections / Stone Materials
- Areas
- Pieces
- Slabs in the SLAB workspace

Each shell section has a consistent header, collapse toggle, body, and optional add action.

The shell keeps the existing browser-surface mount IDs rather than introducing parallel data ownership:

- Project: `#lc-project`, `#lc-date`, `#lc-notes`
- Layouts: `#lc-layouts`, `#lc-add-layout`
- Selections: `#lc-selections-card`, `[data-cad-materials-nav]`
- Areas: `#lc-list`, `#lc-add-area`
- Pieces / entity navigator: `#lc-pieces`, `#lc-add`
- Slabs: `#lc-slabs`, `#lc-slabs-count`

## Persistent shell collapse state

`ProductionShellSurface` now owns only the Navigator section chrome state.

Collapsed section keys are stored under:

`cadlite:v1.6-production-shell:nav-sections`

The storage is intentionally shell-local rather than project data. Storage failures are ignored so a convenience UI preference can never block CAD work.

The implementation updates:

- body `hidden` state
- `aria-expanded`
- `.is-collapsed`
- chevron orientation

CI caught an unsafe `JSON.parse()` assignment while this was being added. The parser was corrected to treat decoded storage as `unknown` and narrow it before use.

## Existing typed surfaces now exposed in production shell

### Materials / Selections

`MaterialSurface` already supported a supplied `#lc-selections-card` and `[data-cad-materials-nav]` host. The production shell now provides those elements, so the typed surface renders directly into the production Navigator instead of creating its architecture-harness fallback.

Its existing Material/Selection Inspector and commands remain authoritative.

### Pieces / Piece Groups / Assemblies

`ProjectLayoutSurface` already renders the entity navigator into `#lc-pieces`.

That existing typed navigator includes:

- fabrication Piece Groups / Assemblies
- grouped Pieces
- backsplash child presentation
- selection / multi-selection behavior
- visibility and entity actions

Piece Group domain behavior was not duplicated in shell code.

### Notes / Dimensions / Lines

The same typed entity navigator already appends production-relevant annotation lists after Pieces, including:

- counts
- select
- rename
- visibility
- delete
- Hide / Show section behavior

The production shell now styles those generated rows as part of one cohesive Navigator system.

### Room Features / Walls

The typed entity navigator already exposes Room Features with:

- count
- visibility
- select
- delete
- Add Base
- Add Filler
- Add Appliance
- Add Wall

These rows and controls now receive production-shell Navigator styling instead of generic harness presentation.

### Floor Plan

`FloorPlanNavigatorSurface` already decorates the `#lc-pieces` entity mount in DESIGN.

That existing surface includes the migrated workflows for:

- Import / Replace
- Prepare
- distance calibration
- 24-inch square calibration
- Hide / Show
- Lock / Unlock
- Flip X / Y
- rotation
- opacity
- grayscale
- include in export
- delete

Batch 51 exposes and styles that existing surface; it does not create a second Floor Plan workflow.

## Typed SLAB Navigator

A production-source check confirmed that v1.5.99 has an expandable `Slabs (n)` Navigator section with Add Slab behavior. Batch 51 therefore restores this as a real typed browser surface rather than treating it as optional chrome.

Added:

`src/browser/slab-navigator-surface.ts`

It provides a workspace-aware projection and browser surface for the active Layout's Slabs.

The Slab Navigator supports:

- SLAB-only visibility
- current Slab count
- name
- slab dimensions
- current selection state
- select Slab
- show / hide Slab
- delete Slab with confirmation
- Add Slab through a proxy to the existing authoritative `#lc-add-slab` control

Detailed Slab editing remains in the existing typed Slab Inspector rather than being duplicated in the Navigator.

## Production Navigator styling

`src/styles/production-shell.css` now contains a shell-scoped compact Navigator visual system for both static and generated browser content.

The styling covers:

- section headers / toggles / chevrons
- selected and active states
- Layout / Area rows
- Material / Selection rows
- Piece rows
- Piece Group / Assembly headers and badges
- grouped Piece indentation
- annotation sections and rename rows
- Room Feature sections / add actions / rows
- Floor Plan controls
- Slab rows
- destructive buttons
- light/dark variables

The architecture harness remains unaffected because these rules are scoped beneath `.cad-lite-production-shell`.

## Validation corrections

This batch had two useful CI catches before acceptance.

### Collapse storage parsing

The first failure was lint-only: direct assignment from `JSON.parse()` violated the no-unsafe-assignment rule. The implementation was tightened rather than weakening lint.

### Saved workspace fixture

The first Slab Navigator test assumed the v1.5.99 fixture booted in DESIGN. In reality, the fixture correctly preserves SLAB as its saved active workspace, consistent with the durable workspace lifecycle already proven in Batches 45–46.

The test was corrected to explicitly enter DESIGN before asserting the Slabs section is absent. No production behavior was changed for that failure.

## Validation

Architecture CI run: `36908435033`

Quality job: `110524766257`

Result: success.

Validated:

- TypeScript typecheck
- lint
- 334 / 334 tests across 48 files
- production build
- browser-ready artifact verification

Artifacts:

- JS: 359.71 kB / 89.65 kB gzip
- CSS: 45.27 kB / 7.17 kB gzip

## Deliberate remaining Navigator gaps

Batch 51 restores the structural and typed Navigator integration but does not claim final pixel-level v1.5.99 parity.

Still reserved for final production acceptance / focused follow-up:

- exact iconography and micro-spacing
- full drag/reorder ergonomics where production had them
- final side-by-side decision on whether Piece Groups deserve a separate static top-level shell heading or remain integrated in the typed Piece entity navigator
- final side-by-side decision on annotation subheading placement
- final light/dark visual QC

Those are shell acceptance questions, not reasons to duplicate the already-migrated domains.

## Production safety

Production `main` remains frozen at v1.5.99. Batch 51 changes only the architecture branch.

## Recommended next batch

Batch 52 should focus on **Production Inspector Integration**.

The right-side Inspector already has substantial typed behavior for Layout, Area, Material, Piece, Sinks, Cutouts, Seams, annotations, Room Features, and Slabs. The next task should be to restore the mature production Inspector hierarchy, spacing, collapsible presentation, action rows, and fabrication-section chrome around those existing typed controls before inventing any new Inspector behavior.
