export {
  TOOL_DEFINITIONS,
  getToolDefinition,
  toolAllowedInWorkspace,
  toolSupportsLock,
  toolSupportsMomentary,
} from './definitions';
export {
  getToolHudModel,
} from './hud';
export type {
  ToolHudModel,
} from './hud';
export {
  createDefaultInteractionState,
  resetActiveInteraction,
} from './state';
export {
  ToolController,
} from './controller';
export type {
  ActiveToolSession,
  InteractionState,
  ModeHudState,
  PointerModifiers,
  PointerSession,
  ToolActivation,
  ToolActivationCapability,
  ToolDefinition,
  ToolHandler,
  ToolHandlerContext,
  ToolId,
  ToolInputResult,
  ToolKeyInput,
  ToolPointerInput,
  ToolScope,
} from './types';

export {
  PieceInteractionController,
  createPieceMoveSession,
  createPieceResizeSession,
  createPieceRotateSession,
  pieceResizeLockedSides,
  previewPieceMove,
  previewPieceNudge,
  previewPieceResize,
  previewPieceRotation,
  resolvePiecePointerSelection,
} from './pieces';
export type {
  PieceInteractionPreview,
  PieceInteractionPreviewItem,
  PiecePointerSelectionPlan,
  PieceResizeSide,
} from './pieces';

export { registerAnnotationToolHandlers } from './annotations';
export type { AnnotationIdFactory, AnnotationSegmentPreview } from './annotations';

export {
  createSplashEdgeTargets,
  hitTestSplashEdge,
  registerSplashToolHandler,
  splashPointHitsEligibleParent,
  splashToolOptions,
} from './splashes';
export type {
  SplashBrushAction,
  SplashEdgeTarget,
  SplashToolIdFactory,
  SplashToolOptions,
} from './splashes';

export {
  createRadiusCornerTargets,
  hitTestRadiusTarget,
  radiusPointHitsEligibleParent,
  radiusToolOptions,
  registerRadiusToolHandler,
} from './radius';
export type {
  RadiusArc,
  RadiusBrushAction,
  RadiusCornerTarget,
  RadiusToolIdFactory,
  RadiusToolOptions,
} from './radius';

export {
  createEdgePainterTargets,
  edgePainterPointHitsEligiblePiece,
  edgePainterToolOptions,
  hitTestEdgePainterTarget,
  normalizeEdgePainterProfile,
  registerEdgePainterToolHandler,
  DEFAULT_EDGE_PAINTER_PROFILE,
  EDGE_PAINTER_PROFILE_KEY,
  EDGE_PAINTER_PROFILES,
} from './edge-painter';
export type {
  EdgePainterBrushAction,
  EdgePainterProfileOption,
  EdgePainterTarget,
  EdgePainterToolOptions,
} from './edge-painter';

export { AnnotationInteractionController } from './annotation-editing';
export type { AnnotationEditPreview, AnnotationEndpoint } from './annotation-editing';

export {
  RoomFeatureInteractionController,
  registerRoomFeatureToolHandlers,
  resolveRoomFeaturePointer,
} from './room-features';
export type {
  RoomFeatureEditPreview,
  RoomFeatureIdFactory,
  RoomFeatureResizeSide,
  RoomFeatureSnapResult,
} from './room-features';
export { registerProductionRoomFeatureToolHandlers } from './room-feature-production-tools';
export { RoomFeatureNudgeController } from './room-feature-nudge';
