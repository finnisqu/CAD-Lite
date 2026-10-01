# Batch 25 — Floor Plan Context Foundation

## Goal

Migrate the persistent Floor Plan underlay contract from the frozen v1.5.99 runtime into the v1.6 typed architecture without turning the plan into a normal drawing selection entity.

Production `main` remains frozen at v1.5.99 while this work lives on `architecture/v1.6-foundation`.

## v1.5.99 behavioral source of truth

The exact `cad-lite-v1.5.99.js` implementation establishes these invariants:

- one Floor Plan belongs to one Layout;
- the plan is DESIGN canvas context, not another selectable drawing entity;
- PDF, PNG, JPG and JPEG are accepted import formats;
- PDFs are rasterized in the browser before preparation;
- the persisted plan is a prepared raster `dataURL`, not a PDF document model;
- crop, level/rotate and eraser work are baked into the prepared raster image;
- Prepare Floor Plan uses local edit history so pointer/editor work does not flood project Undo;
- the plan is centered in the Layout canvas, then `offsetX` / `offsetY` are applied;
- rotation and X/Y mirrors are performed around canvas center;
- visibility, grayscale, opacity, lock state and export inclusion are independent persisted properties;
- calibration scales width and height uniformly and locks the calibrated plan.

The persisted v1.5.99 fields are retained:

- `id`
- `name`
- `dataURL`
- `natW`, `natH`
- `w`, `h`
- `opacity`
- `visible`
- `grayscale`
- `flipX`, `flipY`
- `rotation`
- `calibrated`
- `calibration`
- `locked`
- `includeInExport`
- `margin`
- `offsetX`, `offsetY`

## Domain and persistence

Batch 25 adds `src/domain/floor-plans/index.ts` with:

- `FloorPlan`
- `FloorPlanPatch`
- `normalizeFloorPlan`
- `createFloorPlan`
- `floorPlanCanvasSize`
- `calibrateFloorPlan`

`Layout.plan` is now typed as `FloorPlan | null` rather than arbitrary `JsonValue`.

Canonical Layout normalization passes the plan through `normalizeFloorPlan`, so imported v1.5.99 projects and v1.6 canonical files enter the application with the same typed contract.

Prepared-plan creation retains the v1.5.99 defaults: 40% opacity, visible, unlocked, uncalibrated, no grayscale or mirroring, excluded from export, 6-inch margin, and zero offsets. The longest image dimension initially maps to 300 inches while preserving image aspect ratio.

## Commands

Batch 25 adds typed DESIGN-only active-Layout commands:

- `setFloorPlan`
- `updateFloorPlan`
- `clearFloorPlan`

Each command records one project-history step and requests persistence. Pixel-editor activity is intentionally not modeled as a stream of application commands.

## Canvas projection and rendering

`createFloorPlanCanvasProjection` projects only the active DESIGN Layout plan.

`FloorPlanCanvasSurface` renders the plan as a non-interactive SVG image beneath drawing entities. It preserves:

- centered placement;
- X/Y offsets;
- rotation around canvas center;
- X/Y mirrors;
- opacity;
- grayscale;
- per-Layout visibility.

The underlay is tagged with `data-plan-underlay="1"`, matching the production export boundary.

## Navigator context

The Floor Plan remains intentionally outside shared `Selection`.

`FloorPlanNavigatorSurface` adds a non-selectable Layout-context card with:

- plan identity and calibrated/locked status;
- show/hide;
- lock/unlock;
- horizontal and vertical mirror controls;
- 90-degree rotation;
- opacity;
- grayscale;
- include-in-export state;
- delete with confirmation.

Locked plans refuse transform controls while remaining visible and configurable for display/export state.

## Tests

`tests/floor-plans.test.ts` covers:

- v1.5.99 normalization semantics;
- prepared-plan defaults;
- rotated canvas bounds and margin;
- uniform calibration and lock behavior;
- active DESIGN projection;
- typed set/update/clear commands;
- SLAB workspace guards.

## Deliberate Batch 25 boundary

The persistent context foundation is complete here. The browser import/preparation workflow remains separate because it has a substantially different lifecycle: it operates on large pixel buffers with local editor history, then emits one prepared raster into the canonical project.

Deferred to the next Floor Plan batch:

- PDF.js loading and multi-page PDF page selection;
- PNG/JPG file ingestion;
- the Prepare Floor Plan modal/workspace;
- crop and crop-focus behavior;
- level/straighten line;
- eraser brush and brush-size controls;
- local preparation Undo/Redo;
- WebP/JPEG compression of the prepared raster;
- replace/crop workflow for an existing plan;
- distance calibration interaction;
- 24-inch square calibration interaction;
- `syncCanvasToPlan`, including preserving drawing offsets while changing Layout canvas size;
- final export-pipeline enforcement of `includeInExport` once the v1.6 export surface is migrated.

This split keeps image/PDF preparation transient and browser-specific while the project domain remains small, typed and deterministic.
