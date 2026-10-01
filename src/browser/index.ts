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

export { StartupRecoverySurface } from './startup-recovery-surface';
export type { StartupRecoverySurfaceOptions } from './startup-recovery-surface';
export { CanvasKeyboardSurface } from './canvas-keyboard-surface';
export type { CanvasKeyboardSurfaceOptions } from './canvas-keyboard-surface';

export { MaterialSurface } from './material-surface';
export type { MaterialSurfaceOptions } from './material-surface';
export { ScratchpadSurface } from './scratchpad-surface';
export type { ScratchpadSurfaceOptions } from './scratchpad-surface';
export {
  ProductionInspectorSurface,
  nextProductionInspectorSection,
} from './production-inspector-surface';
export type {
  ProductionInspectorSurfaceOptions,
  ProductionPieceInspectorSection,
} from './production-inspector-surface';
export { ProductionShellSurface } from './production-shell-surface';
export type { ProductionShellSurfaceOptions } from './production-shell-surface';
export {
  ProductionViewportSurface,
  anchoredProductionScroll,
  nextProductionCanvasScale,
  resolveProductionTheme,
  PRODUCTION_WHEEL_COMMIT_MS,
  PRODUCTION_ZOOM_STEP,
  PRODUCTION_THEME_KEY,
} from './production-viewport-surface';
export type {
  ProductionThemeMode,
  ProductionViewportSurfaceOptions,
} from './production-viewport-surface';
export {
  SlabNavigatorSurface,
  createSlabNavigatorProjection,
} from './slab-navigator-surface';
export type {
  SlabNavigatorItem,
  SlabNavigatorProjection,
  SlabNavigatorSurfaceOptions,
} from './slab-navigator-surface';
export {
  ViewPreferencesSurface,
  dimensionFormatFromControl,
  dimensionPrecisionFromControl,
} from './view-preferences-surface';
export type {
  DimensionPrecision,
  ViewPreferencesSurfaceOptions,
} from './view-preferences-surface';

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
