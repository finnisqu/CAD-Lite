import {
  clampCornerRadii,
  type CornerRadii,
  type Piece,
  type PieceSide,
} from '../../domain/pieces';
import type { ReadonlyApplicationState } from '../state';
import type { AppCommand } from './types';

export type PieceOverhangSide = keyof Piece['overhangs'];

export interface PieceEdgePropertiesPatch {
  overhangs?: Partial<Piece['overhangs']>;
  edgeProfiles?: Partial<Record<PieceSide, string>>;
  cornerRadii?: Partial<CornerRadii>;
}

const OVERHANG_SIDES: readonly PieceOverhangSide[] = [
  'front',
  'back',
  'left',
  'right',
];

const EDGE_SIDES: readonly PieceSide[] = [
  'top',
  'right',
  'bottom',
  'left',
];

const CORNER_KEYS: readonly (keyof CornerRadii)[] = [
  'tl',
  'tr',
  'br',
  'bl',
];

function replacePiece(
  state: ReadonlyApplicationState,
  layoutId: string,
  pieceId: string,
  nextPiece: Piece,
): ReadonlyApplicationState {
  const layouts = state.project.layouts.map((layout) =>
    layout.id === layoutId
      ? {
          ...layout,
          pieces: layout.pieces.map((piece) =>
            piece.id === pieceId ? nextPiece : piece,
          ),
        }
      : layout,
  );
  return {
    ...state,
    project: {
      ...state.project,
      layouts,
    },
  };
}

function sameOverhangs(a: Piece['overhangs'], b: Piece['overhangs']): boolean {
  return OVERHANG_SIDES.every((side) => a[side] === b[side]);
}

function sameEdgeProfiles(
  a: Piece['edgeProfiles'],
  b: Piece['edgeProfiles'],
): boolean {
  return EDGE_SIDES.every((side) => a[side] === b[side]);
}

function sameCornerRadii(a: CornerRadii, b: CornerRadii): boolean {
  return CORNER_KEYS.every((corner) => a[corner] === b[corner]);
}

/**
 * Update the already-typed per-Piece fabrication/detail properties that are
 * independent from relationship state. Linked Splash creation/removal is
 * intentionally not handled here.
 */
export function updatePieceEdgeProperties(
  layoutId: string,
  pieceId: string,
  patch: PieceEdgePropertiesPatch,
): AppCommand {
  const input: PieceEdgePropertiesPatch = {
    ...(patch.overhangs ? { overhangs: { ...patch.overhangs } } : {}),
    ...(patch.edgeProfiles
      ? { edgeProfiles: { ...patch.edgeProfiles } }
      : {}),
    ...(patch.cornerRadii
      ? { cornerRadii: { ...patch.cornerRadii } }
      : {}),
  };

  return {
    type: 'piece.edge-properties',
    label: 'Update piece edges and corners',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const layout = state.project.layouts.find((item) => item.id === layoutId);
      const piece = layout?.pieces.find((item) => item.id === pieceId);
      if (!layout || !piece) return state;

      const overhangs = { ...piece.overhangs };
      OVERHANG_SIDES.forEach((side) => {
        const value = input.overhangs?.[side];
        if (typeof value === 'number' && Number.isFinite(value)) {
          overhangs[side] = Math.max(0, value);
        }
      });

      const edgeProfiles = { ...piece.edgeProfiles };
      EDGE_SIDES.forEach((side) => {
        const value = input.edgeProfiles?.[side];
        if (typeof value === 'string') edgeProfiles[side] = value.trim();
      });

      const requestedRadii: CornerRadii = { ...piece.cornerRadii };
      CORNER_KEYS.forEach((corner) => {
        const value = input.cornerRadii?.[corner];
        if (typeof value === 'number' && Number.isFinite(value)) {
          requestedRadii[corner] = Math.max(0, value);
        }
      });
      const cornerRadii = clampCornerRadii(requestedRadii, piece.w, piece.h);

      if (
        sameOverhangs(piece.overhangs, overhangs) &&
        sameEdgeProfiles(piece.edgeProfiles, edgeProfiles) &&
        sameCornerRadii(piece.cornerRadii, cornerRadii)
      ) {
        return state;
      }

      return replacePiece(state, layoutId, pieceId, {
        ...piece,
        overhangs,
        edgeProfiles,
        cornerRadii,
      });
    },
  };
}
