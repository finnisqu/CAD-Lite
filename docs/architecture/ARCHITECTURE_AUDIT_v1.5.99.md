# CAD Lite Architecture Audit — v1.5.99

Status: Architecture Batch 1  
Baseline commit: `77728eed327f144b0b1c5d4b9562747d8d62074e`  
Behavioral baseline: `cad-lite-v1.5.99.js` + `cad-lite-v1.5.99.css`

## 1. Mandate

CAD Lite v1.5.99 is the behavioral gold standard.

The architecture phase must preserve the current product experience unless a behavior change is explicitly approved. UI, shortcuts, drawing behavior, save behavior, workspaces, tools, and interaction patterns are treated as an existing product contract.

The architecture itself is not frozen. The goal is to replace the organically grown internal structure with a maintainable foundation suitable for a serious long-term countertop CAD / takeoff / fabrication application.

Backward compatibility with historical pre-1.5 files is desirable when inexpensive, but it must not distort the new architecture.

## 2. Non-negotiable principles

1. Preserve v1.5.99 behavior.
2. Refactor incrementally; no giant rewrite.
3. Keep `main` / v1.5.99 untouched while architecture work is proven.
4. Build source code from modular files into the same simple deployable JS/CSS artifacts.
5. Prefer explicit domain concepts over UI-shaped data.
6. Separate persisted project data from temporary application/session state.
7. Centralize mutations instead of manually coordinating redraw/save/history in event handlers.
8. Keep geometry and domain logic independent of DOM rendering.
9. Add automated tests around pure geometry, state transitions, commands, and serialization.
10. Remove dead code and temporary bridges once replacements are proven.
11. Avoid adding framework complexity unless it solves a demonstrated CAD Lite problem.

## 3. Baseline observations

The current v1.5.99 JavaScript runtime is approximately:

- 26,327 lines
- 1.16 MB source
- 607 named functions
- ~200 arrow-function helpers
- 699 direct assignments to `state.*`
- 284 explicit `draw()` calls
- 191 explicit `scheduleSave()` calls
- 192 explicit `pushHistory()` calls
- 273 element event-listener registrations
- more than 1,000 direct DOM query/create operations

The current CSS is approximately:

- 16,068 lines
- 442 KB
- many historical version override blocks and repeated selectors

The size alone is not the primary issue. The important issue is that domain changes, UI refreshes, history, autosave, selection, and rendering are manually coordinated throughout the same runtime.

A common mutation pattern currently resembles:

```
mutate data
→ render Navigator/list
→ update Inspector
→ refresh feature-specific UI
→ redraw SVG
→ schedule autosave
→ push history
→ synchronize toolbar
```

This pattern is repeated widely. It works, but it creates coupling and makes future features increasingly expensive to implement safely.

## 4. Existing architecture worth preserving

The application already contains several strong patterns that should be formalized rather than discarded.

### Layout ownership

Layouts already own the primary drawing collections:

- Areas
- Pieces
- Dimensions
- Notes
- Lines
- Room Features
- Floor Plan
- slab/overlay workspace information

The old top-level `state.pieces`, canvas dimensions, grid, etc. are currently bridged to the active Layout using `Object.defineProperty()`. This is evidence that the domain has already evolved toward layout ownership.

### Normalization

Several entities already have normalization/migration functions, including:

- Materials
- Room Features
- Sinks
- Cutouts
- Piece geometry
- Piece seams
- Groups / fabrication assemblies
- old sink-side semantics

These are natural seeds for formal schema migration and validation modules.

### Unified smart snapping

The v1.5.77 snapping work already introduced a shared resolver across several entity types. This is a strong candidate for an early pure geometry/service extraction.

### Snapshot history

Undo/Redo is already centralized around serialized snapshots. This gives the architecture migration a reliable behavioral reference even though the implementation should eventually evolve.

### Shared tool/HUD concepts

Momentary vs. locked tools, shared Mode HUDs, scope selectors, brush actions, and workspace-aware tools show that CAD Lite already wants a common tool-state abstraction.

### Shared Piece identity across DESIGN and SLAB

The same Piece represents installed geometry and fabrication placement, with workspace-specific positioning. That is a useful domain concept and should remain explicit.

## 5. Current domain model

The model below reflects current behavior, not necessarily the final ideal schema.

### Project-level data

Project currently owns or exposes:

- project name
- project date
- project notes
- scratchpad
- Materials
- Layouts
- some user/view preferences stored alongside project export data

### Layout

A Layout currently contains:

- id
- name
- quantity
- DESIGN canvas width / height
- scale
- grid
- grid visibility
- piece fill opacity
- Areas
- active Area
- Pieces
- manual Dimensions
- Notes
- Lines
- Room Features
- Floor Plan underlay
- slab/overlay data and SLAB canvas sizing
- some layout-specific view/state information

### Area

Area is currently a lightweight organizational domain entity:

- id
- name

Pieces reference an Area by `areaId`.

### Material

Material is project-scoped and normalized independently. Pieces / selections refer back to the project material system.

### Piece

Piece is the central countertop entity. It currently combines several concerns:

- identity/name
- Area membership
- DESIGN placement
- width/height
- rotation
- display color/layer
- corner radii
- overhangs
- edge profiles
- sinks
- general cutouts
- piece seams
- backsplash subtype/tag/attachment behavior
- Piece Group metadata
- fabrication Assembly links
- SLAB placement
- fabrication split/join metadata
- slab/material mapping behavior

This is the highest-risk and most important domain to migrate later, not first.

### Piece Group vs. fabrication Assembly

Two concepts currently overlap:

**Piece Group**
- represented by `pieceGroupId` / `pieceGroupName`
- primarily an organizational/selection concept

**Fabrication Assembly**
- authoritative membership comes from seam graph links in `assemblyLinks`
- connected pieces are normalized into a common Piece Group for DESIGN behavior

The new architecture should explicitly distinguish user grouping from fabrication connectivity instead of relying on mirrored metadata.

### Backsplash

Backsplash is currently represented as a Piece subtype/tag with an attachment relationship to a parent Piece.

This is a viable model and should not be changed merely for architectural purity. It should be documented as an explicit Piece subtype if retained.

### Sink

Sink is Piece-owned and includes:

- identity/model
- geometry
- shape
- corner radius
- placement/orientation
- faucet pattern/settings
- inside finish
- fabrication split behavior

### Cutout

Cutout is Piece-owned and supports rectangle/circle/oval geometry with its own placement, rotation, dimensions, finish, and fabrication split behavior.

### Piece Seam

Piece seam is Piece-owned local geometry. Some seams can be converted into authoritative fabrication Assembly relationships.

### Room Feature

Room Features are Layout-owned.

Current normalized types include:

- cabinet/base-like features
- filler/panel
- appliances
- wall
- legacy cabinet runs

Feature entities carry geometry, naming/grouping, and countertop-receiving semantics.

### Annotation entities

Layout-owned annotations include:

- Dimension
- Line
- Note

Note leaders create a relationship between Note and Line behavior.

### Floor Plan

One floor-plan underlay belongs to a Layout and acts as DESIGN context rather than a normal selectable CAD entity.

### SLAB objects

Slab imagery/overlays and Piece fabrication placements are layout-scoped today. The architecture should preserve the current behavior while clarifying the eventual difference between:

- slab inventory/material object
- slab image/overlay
- piece fabrication placement
- workspace presentation state

## 6. Current state categories are mixed together

The central `state` object currently combines at least four fundamentally different kinds of state.

### A. Persisted project/domain state

Examples:

- layouts
- materials
- project metadata
- pieces
- areas
- dimensions
- notes
- room features

### B. Session/selection state

Examples:

- selected piece IDs
- selected Dimension/Line/Note
- selected Area
- selected Material
- selected Room Feature
- selected Layout
- active workspace

### C. Tool interaction state

Examples:

- dimension tool
- note tool
- line tool
- Room Feature mode
- current drags
- momentary/locked tool states
- brush action/scope state

### D. View/preferences state

Examples:

- layer visibility
- number format
- edge-label mode
- grid snap
- slab contrast mode
- workspace view visibility
- user defaults

These categories need separate owners in the new architecture.

## 7. Proposed state architecture

Use four explicit stores/models.

### ProjectState

Persisted business/domain data only.

Conceptually:

```ts
interface ProjectState {
  schemaVersion: number;
  project: ProjectMeta;
  materials: Material[];
  layouts: Layout[];
}
```

### SessionState

Temporary state for the current browser session:

```ts
interface SessionState {
  activeLayoutId: Id;
  workspace: 'design' | 'slab';
  selection: SelectionState;
  activeTool: ToolSession | null;
  hover: HoverState | null;
  drag: DragSession | null;
}
```

### PreferencesState

User/editor preferences that are not the project itself:

```ts
interface PreferencesState {
  theme: 'light' | 'dark';
  dimFormat: 'fraction' | 'decimal';
  dimPrecision: 1 | 2 | 4 | 8 | 16;
  gridSnap: boolean;
  slabContrastMode: 'auto' | 'off';
  toolDefaults: ToolDefaults;
}
```

Some preferences may remain per-project or per-workspace where current behavior requires it; the important point is to make that choice explicit.

### DerivedState / selectors

Computed values should not be stored unless necessary.

Examples:

- current Layout
- selected entities
- Area square footage
- fabrication Assembly membership
- estimated slab count
- selection bounds
- snap candidates
- Piece family / backsplash relationships

## 8. Proposed mutation architecture

The most important change is to centralize meaningful edits as commands.

Current style:

```js
piece.w = nextWidth;
renderList();
updateInspector();
draw();
scheduleSave();
pushHistory();
syncTopBar();
```

Target style:

```ts
commands.execute(
  resizePiece({
    pieceId,
    width: nextWidth
  })
);
```

Conceptual flow:

```
UI / Tool
   ↓
Command
   ↓
Domain mutation / validation
   ↓
Store commit
   ↓
Change notification
   ├── History
   ├── Autosave
   ├── Renderer
   └── UI subscribers
```

This does not require Redux or a heavyweight framework. A small purpose-built command/store layer is enough.

Commands should describe user-meaningful operations, for example:

- AddPiece
- DeletePieces
- MovePieces
- ResizePiece
- AssignPieceArea
- AddSink
- UpdateSink
- AddCutout
- SetEdgeProfile
- AddDimension
- AddNote
- SetMaterial
- AddArea
- MovePieceOnSlab
- ConvertSeamToFabricationJoint
- SwitchWorkspace

Continuous pointer movement should use transient preview state and commit one command/transaction at the end where current behavior expects one Undo step.

## 9. Selection architecture

Selection is currently represented by several separate top-level IDs and arrays.

Replace this with one explicit discriminated model.

Example:

```ts
type Selection =
  | { kind: 'none' }
  | { kind: 'pieces'; ids: Id[] }
  | { kind: 'dimension'; id: Id }
  | { kind: 'line'; id: Id }
  | { kind: 'note'; id: Id }
  | { kind: 'roomFeature'; id: Id }
  | { kind: 'area'; id: Id }
  | { kind: 'material'; id: Id }
  | { kind: 'layout'; id: Id }
  | { kind: 'slab'; id: Id }
  | { kind: 'pieceGroup'; id: Id };
```

This would remove large amounts of manual "clear every other selected ID" logic and make Inspector precedence explicit.

## 10. Tool architecture

Create one ToolController with a shared lifecycle.

Each tool should implement a contract conceptually similar to:

```ts
interface Tool {
  id: ToolId;
  workspace: 'design' | 'slab' | 'both';
  activate(ctx): void;
  pointerDown?(event, ctx): void;
  pointerMove?(event, ctx): void;
  pointerUp?(event, ctx): void;
  keyDown?(event, ctx): void;
  cancel(ctx): void;
  commit?(ctx): void;
  renderOverlay?(ctx): RenderNode[];
  getHudModel?(ctx): HudModel;
}
```

Momentary hold, Shift-lock, HUD state, scope, Add/Erase brushes, temporary visibility forcing, and cancel behavior should be capabilities of the shared controller rather than reimplemented per feature.

## 11. Geometry architecture

Geometry should become a pure dependency with no DOM access.

Recommended modules:

- point/vector primitives
- transforms
- rectangles/polygons
- rotation
- bounds
- projections
- intersections
- distance-to-segment
- rounded-corner geometry
- snapping
- piece local/world transforms
- slab transforms
- cutout geometry
- validation

Functions in this layer should accept data and return data. They must not call `draw()`, manipulate selection, or create SVG elements.

This is especially important groundwork for future non-rectangular Piece geometry.

## 12. Rendering architecture

Do not replace SVG merely because architecture work is happening. The current SVG approach is capable and matches the existing product.

Instead split rendering into read-only modules.

Example:

```
render/design/
  renderDesignCanvas
  renderPiece
  renderSink
  renderCutout
  renderSeam
  renderRoomFeatures
  renderAnnotations

render/slab/
  renderSlabWorkspace
  renderSlab
  renderFabricationPiece
  renderValidation

render/overlays/
  renderSelection
  renderSnapGuides
  renderToolPreview
```

Renderers read ProjectState + SessionState + derived selectors. They do not own business mutations.

## 13. UI architecture

Keep the current UI and visual design.

Split implementation responsibility by surface:

```
ui/
  navigator/
  inspector/
  toolbar/
  hud/
  dialogs/
  scratchpad/
```

The Navigator and Inspector should consume a common selection/context model. They should dispatch commands instead of directly mutating domain objects.

## 14. Persistence and schema

Today CAD Lite has several overlapping persistence paths:

- autosave
- full-app export
- legacy layout export
- share payload
- history snapshot
- import/load
- URL share restore

Create one canonical project serializer.

Recommended persisted root:

```ts
interface CadLiteFile {
  schemaVersion: number;
  appVersion: string;
  project: ProjectState;
}
```

Then adapters can produce:

- autosave representation
- downloadable project file
- compressed share payload
- test fixture

Migration becomes:

```
unknown input
→ detect version
→ migrate sequentially
→ validate
→ canonical ProjectState
```

Historical loaders can be kept behind a `legacy/` adapter while useful, then removed later if maintenance cost exceeds value.

History should eventually use the same canonical state representation but should not automatically include every UI preference or transient selection value.

## 15. Build/tooling recommendation

Recommended architecture tooling:

- TypeScript for new source
- Vite/Rollup-style bundling to a browser-ready single JS artifact
- CSS source split by component/feature, bundled to one CSS artifact
- Vitest for unit tests
- ESLint for correctness rules
- Prettier for formatting
- source maps for development builds
- npm scripts for build/test/lint

Important: this is a development/build change, not a runtime product dependency.

Squarespace can continue loading a simple versioned artifact such as:

```
dist/cad-lite-v1.6.0.js
dist/cad-lite-v1.6.0.css
```

No React/Vue/Svelte rewrite is recommended at this stage. CAD Lite already has a working DOM/SVG UI. A framework migration would multiply risk without solving the most important current problems.

## 16. Proposed source tree

Initial target:

```
src/
  app/
    bootstrap.ts
    store.ts
    commands/
    events/

  domain/
    project/
    layouts/
    materials/
    areas/
    pieces/
    assemblies/
    sinks/
    cutouts/
    seams/
    annotations/
    room-features/
    slabs/

  geometry/
    primitives/
    transforms/
    bounds/
    snapping/
    validation/

  tools/
    tool-controller.ts
    select/
    dimension/
    line/
    note/
    splash/
    radius/
    edge-painter/
    room-features/
    slab-placement/

  rendering/
    design/
    slab/
    overlays/

  ui/
    navigator/
    inspector/
    toolbar/
    hud/
    dialogs/
    scratchpad/

  persistence/
    schema/
    migrations/
    autosave/
    import/
    export/
    share/

  styles/
    tokens.css
    base.css
    navigator.css
    inspector.css
    toolbar.css
    hud.css
    dialogs.css
    canvas.css
    dark.css

tests/
  fixtures/
  domain/
  geometry/
  commands/
  persistence/

dist/
```

Exact boundaries may be refined during extraction.

## 17. CSS strategy

The current CSS contains the history of rapid iterative fixes. That is expected, but the next architecture should stop using chronological override blocks as the primary organization system.

New CSS source should be organized by responsibility and built once.

Recommended approach:

- shared design tokens / custom properties
- base controls
- surface-specific files
- dark-theme rules adjacent to or predictably paired with their components
- no version-number override sections inside source modules
- generated bundle may remain a single CSS file

During migration, visual diff/acceptance testing should compare against v1.5.99.

## 18. Testing strategy

### Golden project fixture

Create one intentionally difficult project containing most behaviors:

- multiple Layouts
- Layout quantities
- multiple Areas
- multiple Materials
- independent Pieces
- Piece Groups
- fabrication Assembly
- backsplash relationships
- sinks + faucet patterns
- general cutouts
- seams
- edge profiles
- corner radii
- overhangs
- Dimensions
- Lines
- Notes + leaders
- Room Features
- linked/full/knee walls
- floor plan
- slab imagery / blank slabs
- SLAB placements
- rotations/mirroring
- light/dark relevant visual conditions

### Automated tests

Highest-value first tests:

1. pure format/rounding utilities
2. geometry transforms
3. snapping arbitration
4. Area/material normalization
5. sink/cutout normalization
6. Assembly graph membership
7. Piece resize/move calculations
8. serialization round trip
9. migration to current schema
10. commands + Undo/Redo transaction behavior

### Manual acceptance suite

For every architecture milestone:

1. load golden project in v1.5.99
2. load same fixture in architecture build
3. compare DESIGN
4. compare SLAB
5. edit representative entities
6. drag/resize/snap
7. use keyboard shortcuts
8. Undo/Redo
9. save/reload
10. import/export
11. light/dark mode
12. PDF/image/export output where relevant

## 19. Migration order

The migration must proceed from lowest-coupling to highest-coupling.

### Batch 1 — Audit and architecture
- current document
- behavioral contract
- domain map
- target architecture
- migration boundaries

No production behavior changes.

### Batch 2 — Tooling/scaffold
- npm project metadata
- TypeScript
- bundler
- test runner
- lint/format config
- `src/`, `tests/`, `dist/`
- prove bundle can coexist with current deployment model

No intentional behavior changes.

### Batch 3 — Pure utilities + geometry foundation
Extract functions with no DOM/state side effects:

- IDs
- clamp/round/format
- transforms
- bounds
- geometry helpers
- smart snapping primitives

Add tests.

### Batch 4 — Canonical schema + persistence boundary
- ProjectState
- schemaVersion
- canonical serializer/deserializer
- migration adapter for v1.5.99
- autosave/export/share adapters

Do not yet force all runtime code to use the new store.

### Batch 5 — Store + command infrastructure
- explicit ProjectState / SessionState / PreferencesState
- command dispatcher
- transaction semantics
- subscribers
- bridge existing runtime into new store

### Batch 6 — Selection + tool controller
- unified Selection
- tool state machine
- momentary/locked behavior
- shared HUD model
- preserve all shortcuts

### Batch 7 — Low-risk feature extraction
Likely order:
- Materials / Areas
- annotations
- Room Features
- floor-plan context
- slab inventory/overlays

### Batch 8 — Navigator / Inspector adapters
Move UI surfaces onto the canonical selection/store/command APIs without changing their visual design.

### Batch 9 — Piece domain
Only after infrastructure is proven:
- Piece schema
- sinks
- cutouts
- edges/corners
- splashes
- seams
- Piece Groups
- fabrication Assembly graph
- resize/mirror/rotation behavior

### Batch 10 — DESIGN / SLAB render split
- explicit render pipelines
- common entity model
- workspace-specific presentation/placement

### Batch 11 — Cleanup
- delete old bridges
- delete legacy duplicated helpers
- remove dead event paths
- collapse CSS overrides
- remove obsolete compatibility code
- document public extension points

### Batch 12 — v1.6.0 acceptance
- golden project
- regression checklist
- production bundle
- preserve v1.5.99 as rollback point

## 20. High-priority architectural risks

### Risk: duplicate sources of truth

The active Layout owns Pieces, while legacy top-level state properties proxy to it. During migration, there must never be two independently mutable copies.

### Risk: hidden behavior in render functions

Some current render paths also normalize/synchronize data. Extraction must identify and move those mutations before renderers can become truly read-only.

### Risk: history semantics

Current Undo/Redo behavior is user-visible and must be preserved. Converting to commands should not accidentally turn one drag into hundreds of undo entries.

### Risk: DESIGN/SLAB coupling

Piece identity is shared while placement differs. This is desirable, but the new schema must make the two transforms explicit.

### Risk: Assembly vs. Group semantics

Fabrication seam graph membership is currently authoritative while Piece Group metadata mirrors the relationship for DESIGN UX. This deserves an explicit domain decision before the Piece migration.

### Risk: CSS visual regression

Historical CSS overrides contain real product fixes. They cannot simply be deleted because they look duplicated. The visual result must be captured before consolidation.

## 21. Product-owner decisions to defer until needed

These do not block the first architecture batches.

1. Is a user Piece Group fundamentally different from a fabrication Assembly?
2. Should backsplash remain a Piece subtype permanently?
3. Should slabs ultimately be project/material inventory rather than Layout-owned?
4. Which view/preferences should travel with a project versus belong to the user/browser?
5. When true non-rectangular Piece geometry arrives, should legacy rectangle fields remain as a convenience API or be fully replaced?

These should be answered when their corresponding domain is migrated, not guessed prematurely.

## 22. Explicit non-goals for the architecture phase

Do not:

- redesign the UI
- change keyboard shortcuts
- add major product features
- replace SVG rendering merely for fashion
- move to React/Vue/Svelte without a demonstrated need
- redesign Piece geometry before the foundation is ready
- preserve obsolete legacy behavior at the expense of clean architecture
- perform a one-shot rewrite

## 23. Definition of success

The architecture phase is successful when:

- CAD Lite still behaves like v1.5.99
- production artifacts remain easy to deploy
- source is modular and readable
- domain entities have explicit schemas
- meaningful mutations go through commands
- persisted project state is distinct from session/UI state
- Undo/Redo is transactional and predictable
- tools share one lifecycle
- geometry is testable without a browser DOM
- DESIGN and SLAB are explicit views of common entities
- new features can be added without editing unrelated systems
- dead historical code can be removed confidently
- a developer can understand the codebase without reading one 26,000-line file

## 24. Recommended next action

Proceed to Batch 2 only after this architecture direction is accepted.

Batch 2 should create the source/build/test scaffold on the architecture branch while leaving v1.5.99 untouched and proving that the new toolchain can emit a single browser-ready JS/CSS pair compatible with the existing deployment workflow.
