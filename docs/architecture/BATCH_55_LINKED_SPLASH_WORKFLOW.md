# Batch 55 — Linked Splash Workflow

Status: complete

Starting architecture head: `4c77fa0a0343828d905b51822ac14cc8ea0d66df`

Validated implementation head: `3dc0998ea7481ffded3122831d637befe8963e9c`

## Goal

Restore the production v1.5.99 linked Splash workflow on top of the typed v1.6 architecture without putting geometry or relationship mutation inside the production HUD.

This batch deliberately separates:

1. linked Splash domain behavior
2. typed add/remove commands
3. relationship synchronization
4. the existing typed tool-controller interaction path
5. production-only Inspector / floating HUD presentation

## v1.5.99 behavior audit

The production source established that a Splash is not a scalar Piece setting. It is a real linked child Piece associated with one physical edge of a parent countertop Piece.

The audited production contract includes:

- one linked Splash per parent physical edge
- default height `4"`
- height clamp `0.25"` to `24"`
- default offset `0"`
- offset clamp `0"` to `1"`
- top / bottom Splash length follows parent width
- left / right Splash length follows parent height
- edge-relative placement follows parent rotation
- linked children inherit parent Area / color / no-fill / opacity
- linked children remain adjacent to the parent family in Piece ordering
- a linked child can be snapped or independently detached
- parent movement / resizing updates snapped linked children
- linked-length behavior remains active independently of snapped placement
- source-edge miter and linked-child contact-edge miter stay synchronized
- Splash creation / removal is DESIGN-only
- `S` is momentary Splash mode
- `Shift+S` locks / unlocks Splash mode
- locked Splash mode defaults to All Pieces scope
- Scope supports Selected Piece and All Pieces
- the brush supports Add and Erase / Subtract behavior
- Height and Offset live in the mode HUD
- blank-canvas click exits
- Enter / Escape exits through the common tool lifecycle
- the floating HUD is draggable and has lock / close / help treatment

## Linked Splash domain

Added:

`src/domain/pieces/splashes.ts`

The domain owns production normalization and geometry:

- `normalizeSplashHeight(...)`
- `normalizeSplashOffset(...)`
- `splashContactEdge(...)`
- `linkedSplashForEdge(...)`
- `linkedSplashPlacement(...)`
- `splashPlacementFitsLayout(...)`
- `createLinkedSplashPiece(...)`
- `insertLinkedSplashAfterFamily(...)`
- `removeLinkedSplashFromEdge(...)`
- `synchronizeLinkedSplashes(...)`

### Child identity

New linked children are normal typed Pieces with production-compatible relationship data:

- `pieceType: 'backsplash'`
- `tags: ['backsplash']`
- `splashKind: 'splash'`
- `splashHeight`
- attachment kind `backsplash`
- `parentPieceId`
- `sourceEdge`
- `linkedLength: true`
- `snapped`
- `offset`

The child inherits the parent Area and appearance values.

### Placement

The placement helper reproduces the edge-relative production model rather than faking a screen-space strip:

- top / bottom use parent width
- left / right use parent height
- parent rotation is respected
- the Splash is centered outward from the physical edge by `offset + height / 2`
- placement is clamped to the DESIGN canvas
- if clamping meaningfully changes the linked pose, the child is created unsnapped

## Typed add / remove commands

Added:

`src/app/commands/piece-splashes.ts`

Commands:

- `addLinkedSplash(...)`
- `removeLinkedSplash(...)`

Behavior:

- DESIGN-only
- history-recording
- persistence-saving
- no Splash-on-Splash creation
- duplicate child on the same parent edge is rejected
- new children are inserted after the parent / existing linked family children
- the parent remains selected after add / remove

The production UI does not mutate Piece arrays directly.

## Linked geometry synchronization

The shared typed Piece command replacement boundary now runs `synchronizeLinkedSplashes(...)` after Piece mutations.

This makes linked behavior follow the same authoritative path used by normal typed Piece edits instead of adding a second UI-only geometry system.

Covered behavior includes:

- parent resize updates linked Splash length
- snapped child follows parent movement / rotation
- independently moved child becomes unsnapped
- an unsnapped child is not forcibly repositioned when the parent later moves
- linked length can remain synchronized independently of snap placement

## Miter synchronization

Added:

`src/domain/pieces/splash-miters.ts`

Helper:

` synchronizeLinkedSplashMiterProfile(...) `

The existing `updatePieceEdgeProperties(...)` command now preserves the production joint relationship:

- parent source edge `miter` updates the linked Splash contact edge
- linked Splash contact edge miter changes update the parent source edge
- unrelated custom edge-profile strings remain untouched

Contact-edge mapping follows production behavior:

- source top / right → child bottom
- source bottom / left → child top

## Typed Splash tool handler

Added:

`src/app/interaction/splashes.ts`

The implementation reuses the existing `ToolController`; no parallel Splash mode state was introduced.

Existing v1.6 tool definitions already supplied the production lifecycle:

- tool id `splash`
- DESIGN-only
- momentary-lockable
- shortcut `S`
- default scope `all`
- Enter dismissal

The new handler adds the missing domain interaction:

- physical edge targets are derived from typed Piece geometry
- Selected Piece scope restricts targets to exactly one selected parent Piece
- All Pieces scope targets all non-backsplash Pieces
- edge hit tolerance follows the production pixel-space formula
- Add emits `addLinkedSplash(...)`
- Subtract / Erase emits `removeLinkedSplash(...)`
- occupied edges are ignored by Add
- Erase targets occupied edges
- blank click outside eligible Pieces cancels the tool
- clicks inside an eligible Piece but away from an edge do not accidentally exit
- Height / Offset come from remembered typed tool options

## Production Splash Inspector / HUD

Added:

`src/browser/production-splash-surface.ts`

This is a production-shell adapter only. It owns presentation and delegates all CAD mutation to the typed tool / command layers.

### Piece Inspector

A real `Splashes` section now appears for exactly one selected non-backsplash Piece in DESIGN.

It shows:

- physical-edge presence state for Top / Right / Bottom / Left
- `+ Add Splash` launch action
- active-state feedback when Splash mode is already running

The section is now part of the exclusive production Piece Inspector accordion:

`Piece Info → Appearance → Overhangs → Splashes → Edges & Corners → Sinks → Cutouts → Seams → Fabrication Seams`

### Floating HUD

The production HUD includes:

- SPLASH title
- Lock / unlock behavior
- Close action
- Scope: Selected Piece / All Pieces
- Brush: Add / Subtract
- Height
- Offset
- Selected-scope warning when no valid parent is selected
- clipped HELP treatment with a full hover tooltip
- draggable position persisted in the shared session HUD state

The HUD remains session/tool state rather than durable project data.

### Canvas edge brush

The production surface draws presentation-only SVG targets while the `ToolController` remains the interaction owner.

Add mode shows:

- eligible physical edges
- a linked Splash geometry preview for unoccupied edges

Subtract mode highlights existing linked Splash edges with danger styling.

The overlay is pointer-transparent. Pointer events continue through the existing `PieceCanvasSurface → ToolController → Splash handler` path, avoiding duplicate click ownership.

## Styling

Added:

`src/styles/production-splash.css`

Loaded through `src/main.ts`.

It provides production-shell-scoped styles for:

- Splash Inspector section
- edge-presence chips
- launch action
- floating HUD
- segmented Scope and Brush controls
- measurements
- warning/help states
- draggable HUD behavior
- add-preview polygons
- add / occupied / subtract edge target states
- narrow-screen fallback

## Tests

Added:

`tests/linked-splashes.test.ts`

Coverage includes:

- production height / offset normalization
- edge-relative placement
- one child per edge
- inherited relationship / appearance data
- miter propagation at creation
- family-adjacent insertion
- parent-selection retention
- canvas-clamp / unsnapped behavior
- edge-specific removal
- direct relationship synchronization
- DESIGN-only command gating

Added:

`tests/linked-splash-miters.test.ts`

Coverage includes:

- parent → child miter synchronization
- child → parent miter synchronization
- custom profile preservation

Added:

`tests/linked-splash-command-sync.test.ts`

Coverage includes:

- linked length after parent resize
- snapped movement after parent move
- independent child detachment behavior

Added:

`tests/splash-tool-interaction.test.ts`

Coverage includes:

- production tool defaults
- All Pieces default scope
- Selected Piece scope targeting
- Add through `ToolController`
- Subtract through `ToolController`
- remembered Height / Offset
- blank-click exit

Added:

`tests/production-splash-surface.test.ts`

Coverage includes:

- selected parent projection
- occupied-edge projection
- backsplash-child exclusion
- DESIGN / selection gating

Expanded:

`tests/production-inspector-surface.test.ts`

The production accordion sequence now explicitly covers Splashes.

## Validation notes

An early domain CI gate exposed two implementation/test cleanup issues:

- a redundant TypeScript narrowing branch
- a test attempting to mutate store state through a nonexistent direct helper

Both were corrected without changing the Splash behavior. The test now moves the parent through the real typed `transformPieces(...)` path.

A later domain / relationship checkpoint passed before HUD work proceeded.

## Final validation

Validated implementation head:

`3dc0998ea7481ffded3122831d637befe8963e9c`

Architecture CI run:

`36919161303`

Quality job:

`110560569527`

Result: success.

Validated:

- TypeScript typecheck
- lint
- 370 / 370 tests across 58 files
- production build
- browser-ready artifact verification

Artifacts:

- JS: 400.84 kB / 99.77 kB gzip
- CSS: 73.61 kB / 10.43 kB gzip

## Ownership / architecture result

The final ownership remains explicit:

- Splash relationship geometry: domain
- add / remove persistence and history: typed commands
- linked relationship synchronization: domain + shared Piece command boundary
- mode lifecycle / shortcut / scope / remembered options: existing `ToolController`
- edge hit resolution: typed Splash tool handler
- Inspector / HUD / visual edge previews: production browser surface

No production-shell code mutates linked Piece relationships directly.

## Production safety

Production `main` remains frozen at:

`77728eed327f144b0b1c5d4b9562747d8d62074e`

No v1.5.99 production artifact was modified.

## Recommended next batch

Do not automatically treat the next batch as another feature migration.

Batch 56 should re-audit the remaining production-shell parity matrix after the now-restored Piece Inspector / Splash workflow and select the highest-value remaining production integration gap. Likely candidates include the other mode HUD families (Radius Labels / Edge Painter), Floor Plan production presentation, or output/export parity, but the repo and v1.5.99 source should decide the next slice rather than assuming one in advance.
