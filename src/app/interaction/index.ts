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
export { RoomFeatureNudgeController } from './room-feature-nudge';
