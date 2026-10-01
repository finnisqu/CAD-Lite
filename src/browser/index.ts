export {
  createProjectLayoutViewModel,
} from './project-layout-model';
export type {
  AreaRowModel,
  ProjectLayoutRowModel,
  ProjectLayoutViewModel,
  SelectedAreaModel,
  SelectedLayoutModel,
} from './project-layout-model';

export {
  ProjectLayoutSurface,
} from './project-layout-surface';
export type {
  BrowserConfirm,
  BrowserEntityIdFactory,
  ProjectLayoutSurfaceOptions,
} from './project-layout-surface';

export { ProjectFileSurface } from './project-file-surface';
export type {
  BrowserProjectDownload,
  ProjectFileSurfaceOptions,
} from './project-file-surface';

export { MaterialSurface } from './material-surface';
export type { MaterialSurfaceOptions } from './material-surface';
export { ScratchpadSurface } from './scratchpad-surface';
export type { ScratchpadSurfaceOptions } from './scratchpad-surface';

export {
  mountCadLiteBrowserRuntime,
} from './runtime';
export type {
  CadLiteBrowserRuntime,
  CadLiteBrowserRuntimeOptions,
} from './runtime';

export {
  createPieceCanvasProjection,
  hitTestPieceCanvas,
  hitTestSlabCanvas,
  projectPieceForCanvas,
  DEFAULT_SLAB_CANVAS_HEIGHT,
  DEFAULT_SLAB_CANVAS_WIDTH,
  SLAB_CONTENT_GUTTER,
} from './piece-canvas-model';
export type {
  PieceCanvasAppearance,
  PieceCanvasItem,
  PieceCanvasOverride,
  PieceCanvasProjection,
  PieceCanvasRenderOptions,
  PieceCanvasSlab,
} from './piece-canvas-model';

export {
  PieceCanvasSurface,
} from './piece-canvas-surface';
export type {
  PieceCanvasSurfaceOptions,
} from './piece-canvas-surface';

export {
  createAnnotationCanvasProjection,
  hitTestAnnotations,
} from './annotation-canvas-model';
export type {
  AnnotationCanvasProjection,
  CanvasDimensionProjection,
  CanvasLineProjection,
  CanvasNoteProjection,
} from './annotation-canvas-model';

export { createFloorPlanCanvasProjection } from './floor-plan-canvas-model';
export type { FloorPlanCanvasProjection } from './floor-plan-canvas-model';
export { FloorPlanCanvasSurface } from './floor-plan-canvas-surface';
export type { FloorPlanCanvasSurfaceOptions } from './floor-plan-canvas-surface';
export { FloorPlanNavigatorSurface } from './floor-plan-navigator-surface';
export type { FloorPlanNavigatorSurfaceOptions } from './floor-plan-navigator-surface';
export { FloorPlanPreparationSurface } from './floor-plan-preparation-surface';
export type { FloorPlanPreparationSurfaceOptions } from './floor-plan-preparation-surface';

export {
  createRoomFeatureCanvasProjection,
  hitTestRoomFeatures,
  projectRoomFeatureForCanvas,
} from './room-feature-canvas-model';
export type {
  RoomFeatureCanvasItem,
  RoomFeatureCanvasProjection,
} from './room-feature-canvas-model';

export { RoomFeatureCanvasInteractions } from './room-feature-canvas-interactions';
export type { RoomFeatureCanvasInteractionsOptions } from './room-feature-canvas-interactions';
