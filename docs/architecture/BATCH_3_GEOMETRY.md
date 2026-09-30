# Architecture Batch 3 — Pure Utilities and Geometry

Status: implementation checkpoint  
Behavior baseline: v1.5.99  
Branch: `architecture/v1.6-foundation`

## Purpose

Batch 3 is the first extraction of real CAD Lite behavior into the TypeScript
source tree.

The batch deliberately targets deterministic code that can run without:

- DOM access
- SVG access
- global CAD Lite state
- localStorage
- history
- autosave
- selection
- UI refreshes

This keeps the first migration low risk and establishes the pattern that later
domain extractions will follow.

## Extracted behavior

### Numeric compatibility

Legacy functions:

- `clamp`
- `round3`
- `fmt3`
- `normDeg`

New source:

- `src/core/numeric.ts`

The new names are clearer where appropriate, but tests preserve the v1.5.99
coercion and rounding behavior.

### Rectangle and vector geometry

Legacy behavior:

- `rotateVec`
- `realSize`
- `slabRectsOverlap`
- `slabRectContainsPoint`
- `slabRectContainsPolygon`

New source:

- `src/geometry/vector.ts`
- `src/geometry/rectangle.ts`

### Convex polygon geometry

Legacy behavior:

- `slabPolygonCenter`
- `slabPolygonAxes`
- `slabProjectPolygon`
- `slabPolygonsOverlap`
- `slabPointSegmentDistance`
- `slabPolygonDistance`

New source:

- `src/geometry/polygon.ts`

The SAT rule that allows merely touching slab pieces remains intentional.
Required fabrication spacing is handled separately by cut-clearance logic.

### Unified smart snapping

Legacy behavior:

- `smartSnapCandidate`
- `smartSnapBetter`
- `resolveSmartSnapAxes`
- `smartSnapBoxAnchors`
- `smartSnapAxisPairs`
- `smartSnapGridAxis`
- `smartSnapPoint`

New source:

- `src/geometry/snapping.ts`

The only architectural change is dependency injection for grid settings.
The v1.5.99 functions read `state.grid` and `state.gridSnap` directly.
The pure TypeScript versions receive `gridStep` / `gridSnap` or `step` as
arguments. Supplying the current state values preserves behavior while removing
the geometry layer's dependency on application state.

### Drawing constraint

Legacy behavior:

- `constrainDrawPoint`

New source:

- `src/geometry/constraints.ts`

The gentle automatic straightening threshold remains exactly 3 degrees, while
forced/Shift straightening remains a strong nearest-axis constraint.

## Tests added

- numeric coercion / rounding
- degree normalization
- rotated rectangle bounding boxes
- rectangle overlap and gap semantics
- rectangle containment epsilon
- convex SAT overlap
- touching-polygon behavior
- point-to-segment distance
- polygon distance
- smart-snap priority
- smart-snap tolerance and `always`
- axis arbitration
- anchor/pair generation
- grid snapping
- point snapping and bypass
- 3 degree automatic straightening
- forced axis constraint

## What this batch does not do

The v1.5.99 production runtime is not yet rewired to import these functions.

That is intentional. Batch 3 first establishes a typed, tested canonical
implementation on the architecture branch. Runtime adoption happens only after
the module boundary is proven and the bridge strategy is ready.

Also deliberately deferred:

- Piece-specific geometry
- corner radii
- overhang/support polygons
- sinks
- cutouts
- seams
- Room Feature normalization
- slab/project state
- DOM/SVG render code

## Acceptance rule

Batch 3 is accepted when the branch passes the full Architecture CI gate:

1. deterministic `npm ci`
2. TypeScript strict typecheck
3. ESLint
4. Vitest
5. Vite production build
6. browser artifact verification
