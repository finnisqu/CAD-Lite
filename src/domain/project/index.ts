export {
  assignPieceFamiliesToArea,
  backsplashParentId,
  getAreaDeletionPlan,
  isBacksplashPiece,
  pieceGroupId,
  pieceId,
  pieceIdsAssignedToArea,
  resolvedPieceAreaId,
  resolvePieceAreaFamilyIds,
  visiblePieceCountForArea,
} from './areas';
export type {
  AreaAssignmentResult,
  AreaDeletionPlan,
} from './areas';

export {
  createEmptyLayout,
  duplicateLayoutRecord,
  hasExactIdOrder,
} from './layouts';
export type { EmptyLayoutInput } from './layouts';

export type {
  Area,
  Layout,
  Material,
  PersistedEntity,
  ProjectMeta,
  ProjectState,
} from './types';
