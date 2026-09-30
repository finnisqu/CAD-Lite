import type { JsonObject } from '../types';

export type PiecePose = { x: number; y: number; rotation: number };
export type PieceSide = 'top' | 'right' | 'bottom' | 'left';
export type PieceSeamOrientation = 'vertical' | 'horizontal';
export type PieceSeamReference = PieceSide;
export type PieceSeam = JsonObject & {
  id: string;
  orientation: PieceSeamOrientation;
  reference: PieceSeamReference;
  offset: number;
};
export type CornerRadii = { tl: number; tr: number; br: number; bl: number };
export type PieceGeometry = {
  kind: 'rectangle';
  width: number;
  height: number;
  cornerRadii: CornerRadii;
};
// Child detail is preserved at a compatibility boundary until its own batch.
export type FabricationChild = JsonObject & { id: string };
export type AssemblyLink = JsonObject & {
  id: string;
  kind: string;
  matePieceId: string;
  sourceSeamId: string | null;
};
export type SplashAttachment = JsonObject & {
  kind: 'backsplash';
  parentPieceId: string;
};

/** Typed rectangle-era storage. Consumers obtain geometry through pieceGeometry.
 * A future shape migration replaces this storage adapter, not every consumer.
 * No arbitrary index signature: unmigrated fields live in legacy.
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
  overhangs: { front: number; back: number; left: number; right: number };
  edgeProfiles: Record<PieceSide, string>;
  sinks: FabricationChild[];
  cutouts: FabricationChild[];
  pieceSeams: PieceSeam[];
  color: string;
  noFill: boolean;
  fillOpacity: number | null;
  splashKind: string | null;
  splashHeight: number | null;
  legacy: JsonObject;
};
