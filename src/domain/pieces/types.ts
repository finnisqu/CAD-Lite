import type { JsonObject } from '../types';

export type PiecePose = { x: number; y: number; rotation: number };
export type PieceWorkspace = 'design' | 'slab';
export type PieceSide = 'top' | 'right' | 'bottom' | 'left';
export type PieceSeamOrientation = 'vertical' | 'horizontal';
export type PieceSeamReference = PieceSide;
export type PieceSeam = JsonObject & {
  id: string;
  orientation: PieceSeamOrientation;
  reference: PieceSeamReference;
  offset: number;
};

export type PieceSinkType = 'model' | 'custom';
export type PieceSinkShape = 'rect' | 'oval';
export type PieceSinkSide = 'front' | 'back' | 'left' | 'right';
export type PieceSinkInsideFinish = 'polished' | 'unpolished';
export type PieceSinkFabricationPose = {
  cx: number;
  cy: number;
};
export type PieceSink = JsonObject & {
  id: string;
  name: string;
  type: PieceSinkType;
  modelId: string | null;
  shape: PieceSinkShape;
  w: number;
  h: number;
  cornerR: number;
  side: PieceSinkSide;
  centerline: number;
  setback: number;
  rotation: number;
  faucets: number[];
  faucetSetback: number;
  faucetHoleDiameter: number;
  faucetHoleSpacing: number;
  insideFinish: PieceSinkInsideFinish;
  fabricationSplitSinkId: string | null;
  fabricationPose: PieceSinkFabricationPose | null;
};
export type PieceSinkPatch = Partial<
  Pick<
    PieceSink,
    | 'name'
    | 'type'
    | 'modelId'
    | 'shape'
    | 'w'
    | 'h'
    | 'cornerR'
    | 'side'
    | 'centerline'
    | 'setback'
    | 'rotation'
    | 'faucets'
    | 'faucetSetback'
    | 'faucetHoleDiameter'
    | 'faucetHoleSpacing'
    | 'insideFinish'
  >
>;

export type PieceCutoutKind = 'rectangle' | 'circle' | 'oval';
export type PieceCutoutInsideFinish = 'polished' | 'unpolished';
export type PieceCutout = JsonObject & {
  id: string;
  name: string;
  kind: PieceCutoutKind;
  cx: number;
  cy: number;
  w: number;
  h: number;
  diameter: number | null;
  cornerR: number;
  rotation: number;
  insideFinish: PieceCutoutInsideFinish;
  fabricationSplitCutoutId: string | null;
};
export type PieceCutoutPatch = Partial<
  Pick<
    PieceCutout,
    | 'name'
    | 'kind'
    | 'cx'
    | 'cy'
    | 'w'
    | 'h'
    | 'diameter'
    | 'cornerR'
    | 'rotation'
    | 'insideFinish'
  >
>;
export type CornerRadii = { tl: number; tr: number; br: number; bl: number };
export type PieceGeometry = {
  kind: 'rectangle';
  width: number;
  height: number;
  cornerRadii: CornerRadii;
};

/**
 * CAD Lite keeps the mature width/height rectangle as an editable frame while
 * allowing the actual fabrication boundary to be an arbitrary local polygon.
 * Coordinates are stored in Piece-local inches with (0, 0) at the frame's
 * upper-left corner. Sinks/cutouts remain semantic children and are subtracted
 * when a derived fabrication region is requested.
 */
export type PieceFabricationPoint = { x: number; y: number };
export type PieceFabricationShape = {
  kind: 'polygon';
  outer: PieceFabricationPoint[];
};

// Child detail is preserved at a compatibility boundary until its own batch.
export type FabricationChild = JsonObject & { id: string };
export type AssemblyLink = JsonObject & {
  id: string;
  kind: string;
  matePieceId: string;
  sourceSeamId: string | null;
  side?: PieceSide;
  mateSide?: PieceSide;
  orientation?: PieceSeamOrientation;
  sourceName?: string;
  cutCoordinate?: number;
};
export type SplashAttachment = JsonObject & {
  kind: 'backsplash';
  parentPieceId: string;
  sourceEdge?: PieceSide;
  linkedLength?: boolean;
  snapped?: boolean;
  offset?: number;
};

/** Typed rectangle-era storage. Consumers obtain geometry through pieceGeometry.
 * The rectangle remains the editing frame while fabricationShape can carry an
 * arbitrary polygonal countertop boundary. No arbitrary index signature:
 * unmigrated fields live in legacy.
 */
export type Piece = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  layer: number;
  areaId: string;
  pieceGroupId: string | null;
  pieceGroupName: string | null;
  pieceType: string;
  tags: string[];
  attachment: SplashAttachment | null;
  assemblyLinks: AssemblyLink[];
  slabPlacement: PiecePose;
  cornerRadii: CornerRadii;
  fabricationShape?: PieceFabricationShape | null;
  overhangs: { front: number; back: number; left: number; right: number };
  edgeProfiles: Record<PieceSide, string>;
  sinks: PieceSink[];
  cutouts: PieceCutout[];
  pieceSeams: PieceSeam[];
  color: string;
  noFill: boolean;
  fillOpacity: number | null;
  splashKind: string | null;
  splashHeight: number | null;
  legacy: JsonObject;
};
