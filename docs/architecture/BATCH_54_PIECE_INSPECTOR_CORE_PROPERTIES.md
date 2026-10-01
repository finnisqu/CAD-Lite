# Batch 54 — Piece Inspector Core Properties

Status: complete

Starting architecture head: `283972bde647533cdee4803c5dca2035a5148b18`

Validated implementation head: `d36c7d13a35f32ad6d03a2dbe266e8c9f21eb7db`

## Goal

Restore the production Piece Inspector sections whose durable typed Piece data already existed in v1.6, without inventing placeholder controls for workflows that are not yet migrated.

This batch covers:

- Appearance
- Overhangs
- Edges & Corners

The linked Splash workflow is deliberately excluded and remains a separate production-parity workstream.

## Audit finding

The typed Piece model already contained the durable data required for these three Inspector sections:

- color
- no-fill state
- per-Piece fill opacity
- front / back / left / right overhangs
- top / right / bottom / left edge-profile strings
- four corner radii

No schema migration was required.

The audit also confirmed that edge profiles must remain string-compatible rather than being reduced to a new hard-coded enum. Existing / historical custom profile names must round-trip without coercion.

## Typed Piece edge/detail command

Added:

`src/app/commands/piece-edge-properties.ts`

Command:

`updatePieceEdgeProperties(layoutId, pieceId, patch)`

It supports typed patches for:

- overhangs
- edge profiles
- corner radii

Behavior:

- overhang values are finite and clamped to zero or greater
- edge-profile strings are trimmed but otherwise preserved
- corner radii are finite, nonnegative, and normalized through the existing domain `clampCornerRadii(...)` helper
- unrelated Piece data is preserved
- normalized no-op updates do not create store/history work
- normal updates record history and persist

The command intentionally does not own linked Splash creation/removal.

Appearance continues to use the existing `updatePieceProperties(...)` command instead of widening one command into an unrelated catch-all.

## Production Piece properties surface

Added:

`src/browser/production-piece-properties-surface.ts`

The production-only surface projects and edits these controls only when:

- the workspace is DESIGN; and
- exactly one Piece is selected.

It no-ops in the architecture harness.

### Appearance

Restored real controls for:

- Piece color
- Fill Opacity
- No Fill

Mutations route through the existing typed Piece-properties command.

### Overhangs

Restored independent numeric controls for:

- Front
- Back
- Left
- Right

The UI uses eighth-inch-friendly `0.125` increments while the typed command remains authoritative for normalization.

### Edges & Corners

Restored production-style physical-side presentation around a central Piece diagram:

- Top edge profile
- Right edge profile
- Bottom edge profile
- Left edge profile
- Top Left radius
- Top Right radius
- Bottom Right radius
- Bottom Left radius

Edge-profile inputs are text-compatible rather than enum-limited so imported/custom production values remain valid.

Corner radius inputs expose a UI maximum of half the smaller Piece dimension while the domain clamp remains authoritative.

## Inspector accordion integration

The existing production-only Inspector decorator now includes the real new sections in the exclusive Piece accordion:

- Piece Info
- Appearance
- Overhangs
- Edges & Corners
- Sinks
- Cutouts
- Seams
- Fabrication Seams when present

The Piece Info wrapper stop boundary was updated so the new sections cannot be swallowed into the Piece Info body.

No empty legacy section is created for Splashes.

## Runtime / ownership

The new Piece-properties surface is mounted through the standard browser runtime.

Ownership remains explicit:

- typed commands own durable Piece mutation
- `ProductionPiecePropertiesSurface` owns production-only controls for the missing sections
- `ProductionInspectorSurface` owns production-only accordion presentation
- the typed canvas renderer consumes the same Piece state

The architecture harness remains unaffected.

## Styling

Added:

`src/styles/production-piece-properties.css`

The stylesheet is scoped beneath `.cad-lite-production-shell` and provides:

- production Inspector section/header/body chrome
- Appearance controls
- Overhang grid
- physical-side edge-profile layout around a Piece diagram
- corner-radius grid
- responsive fallback at narrower Inspector widths

## Validation correction

The first new projection test assumed the legacy fixture should normalize the selected Piece's front overhang to `0`.

CI correctly showed that the v1.5.99 fixture migrates that production value as `1.5` inches.

The test was corrected to assert the real migrated value rather than changing production behavior. This was a test-assumption correction, not a command or migration fix.

## Tests

Added:

`tests/piece-edge-properties.test.ts`

Coverage includes:

- nonnegative overhang normalization
- arbitrary/custom profile-string preservation
- radius clamping against Piece geometry
- non-finite input rejection
- normalized no-op behavior

Added:

`tests/production-piece-properties-surface.test.ts`

Coverage includes:

- single selected DESIGN Piece projection
- preservation of migrated production overhang data
- selection/workspace gating

Expanded:

`tests/production-inspector-surface.test.ts`

The exclusive accordion test now explicitly traverses:

`Piece Info → Appearance → Overhangs → Edges & Corners → Sinks → Cutouts`

## Validation

Architecture CI run: `36914498177`

Quality job: `110545021205`

Result: success.

Validated:

- TypeScript typecheck
- lint
- 349 / 349 tests across 53 files
- production build
- browser-ready artifact verification

Artifacts:

- JS: 382.74 kB / 95.07 kB gzip
- CSS: 67.87 kB / 9.75 kB gzip

## Deliberate boundary — Splashes

Splashes are not omitted accidentally.

The architecture currently understands important linked-backsplash relationships such as parent/child identity and family behavior, but this audit did not find a complete authoritative typed workflow for production Splash creation/removal/editing.

Production Splashes therefore must not be represented as a fake Inspector form over `splashKind`, `splashHeight`, or attachment fields.

The next Splash batch should first reconstruct the real v1.5.99 behavior contract, then add the necessary typed relationship commands and only then restore Inspector / floating-HUD controls.

## Production safety

Production `main` remains frozen at:

`77728eed327f144b0b1c5d4b9562747d8d62074e`

No v1.5.99 artifact was modified.

## Recommended next batch

Batch 55 should audit and migrate the linked Splash workflow.

The audit should specifically establish:

- add/remove semantics by physical Piece edge
- linked backsplash child creation
- linked-length behavior
- snapped placement behavior
- height / offset semantics
- Add versus Subtract brush behavior
- Scope behavior (selected Piece versus broader scope)
- floating HUD state and help treatment
- interaction with Piece family move/delete/duplicate/copy behavior

If the production source reveals that the later HUD/brush system is separable from the underlying linked-Splash domain commands, migrate the domain transaction first and shell/HUD controls second rather than collapsing both into one fragile implementation.
