import type { Layout } from '../project/types';
import type { Piece, PieceGeometry, PiecePose, PieceWorkspace } from './types';

export function pieceGeometry(piece: Piece): PieceGeometry {
  return {
    kind: 'rectangle', width: piece.w, height: piece.h,
    cornerRadii: { ...piece.cornerRadii },
  };
}

export function piecePose(piece: Piece, workspace: PieceWorkspace): PiecePose {
  return workspace === 'slab'
    ? { ...piece.slabPlacement }
    : { x: piece.x, y: piece.y, rotation: piece.rotation };
}

export function createPiece(
  layout: Layout,
  id: string,
  options: { name?: string; areaId?: string } = {},
): Piece {
  if (!id.trim()) throw new Error('Piece ID must be supplied by the caller.');
  const grid = Math.max(.001, Math.abs(layout.grid || 1));
  const inset = Math.round(Math.max(grid * 3, 4 + grid * 2) / grid) * grid;
  const x = Math.max(0, Math.min(inset, layout.cw - 40 - inset));
  const y = Math.max(0, Math.min(inset, layout.ch - 25.5 - inset));
  const areaId = options.areaId ?? layout.activeAreaId;
  if (!layout.areas.some(area => area.id === areaId)) {
    throw new Error('Piece requires an existing Area.');
  }
  return {
    id, name: options.name?.trim() || `Piece ${layout.pieces.length + 1}`,
    x, y, w: 40, h: 25.5, rotation: 0,
    layer: Math.max(0, ...layout.pieces.map(piece => piece.layer)) + 1,
    areaId, pieceGroupId: null, pieceGroupName: null,
    pieceType: 'countertop', tags: [], attachment: null, assemblyLinks: [],
    slabPlacement: { x, y, rotation: 0 },
    cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 },
    fabricationShape: null,
    overhangs: { front: 1.5, back: 0, left: 0, right: 0 },
    edgeProfiles: { top: 'none', right: 'none', bottom: 'none', left: 'none' },
    sinks: [], cutouts: [], pieceSeams: [],
    color: '#ffffff', noFill: false, fillOpacity: null,
    splashKind: null, splashHeight: null, legacy: {},
  };
}
