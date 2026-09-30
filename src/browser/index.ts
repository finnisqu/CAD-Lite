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
