export { CommandDispatcher } from './dispatcher';
export type { TransactionOptions } from './dispatcher';

export {
  addArea,
  assignPiecesToArea,
  deleteArea,
  renameArea,
  reorderAreas,
  setActiveArea,
} from './areas';
export type { SetActiveAreaOptions } from './areas';

export {
  addLayout,
  deleteLayout,
  duplicateLayout,
  renameLayout,
  reorderLayouts,
  setLayoutQuantity,
} from './layouts';
export type {
  AddLayoutOptions,
  DuplicateLayoutOptions,
} from './layouts';
export {
  updateLayoutViewport,
  MIN_CANVAS_DIMENSION,
  MIN_CANVAS_SCALE,
  MAX_CANVAS_SCALE,
  MIN_GRID_SIZE,
} from './layout-viewport';
export type {
  LayoutViewportCommandOptions,
  LayoutViewportPatch,
} from './layout-viewport';

export {
  renameMaterial,
  setProjectMeta,
} from './project';
export {
  addMaterial,
  deleteMaterial,
  updateMaterial,
} from './materials';
export { updateProjectScratchpad } from './scratchpad';

export { updatePreferences } from './preferences';
export {
  addCanvasNote,
  addDimension,
  addDrawingLine,
  addNoteLeader,
  deleteCanvasNote,
  deleteDimension,
  deleteDrawingLine,
  removeNoteLeaders,
  updateCanvasNote,
  updateDimension,
  updateDrawingLine,
} from './annotations';
export {
  calibrateFloorPlanDistance,
  calibrateFloorPlanSquare,
  clearFloorPlan,
  setFloorPlan,
  updateFloorPlan,
} from './floor-plans';
export {
  addRoomFeature,
  deleteRoomFeature,
  updateRoomFeature,
} from './room-features';
export {
  addSlabSurface,
  deleteSlabSurface,
  updateSlabSurface,
} from './slabs';
export {
  setActiveLayout,
  setSelection,
  setWorkspace,
} from './session';
export type {
  AppCommand,
  CommandSummary,
} from './types';
export { summarizeCommand } from './types';

export {
  updatePieceEdgeProperties,
} from './piece-edge-properties';
export type {
  PieceEdgePropertiesPatch,
  PieceOverhangSide,
} from './piece-edge-properties';

export {
  addPiece,
  applyFabricationTransaction,
  addPieceCutout,
  addPieceSeam,
  addPieceSink,
  deletePieces,
  copyPieceCutout,
  copyPieceSink,
  duplicatePieces,
  editPieceCutout,
  editPieceSeam,
  editPieceSink,
  groupPieces,
  mirrorPieces,
  removePieceCutout,
  removePieceSeam,
  removePieceSink,
  renamePiece,
  renamePieceGroup,
  resizePieceDimension,
  transformPieces,
  ungroupPieceGroups,
  updatePieceProperties,
} from './pieces';
export type { PieceTransformPatch, TransformPiecesOptions } from './pieces';
