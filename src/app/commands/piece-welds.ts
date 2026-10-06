import {
  clearPieceWeld,
  preparePieceWeld as prepareDomainPieceWeld,
  type PieceFabricationWeld,
  type PieceWeldPreparationResult,
} from '../../domain/pieces';
import { cloneJson } from '../../domain/types';
import type { AppCommand } from './types';

export type PreparePieceWeldResult = PieceWeldPreparationResult;

export async function preparePieceWeld(
  layout: Parameters<typeof prepareDomainPieceWeld>[0],
  pieceIds: readonly string[],
  weldId: string,
): Promise<PreparePieceWeldResult> {
  return prepareDomainPieceWeld(layout, pieceIds, weldId);
}

export function applyPreparedPieceWeld(
  layoutId: string,
  prepared: Extract<PreparePieceWeldResult, { ok: true }>,
): AppCommand {
  const sourceSignature = prepared.sourceSignature;
  const memberIds = new Set(prepared.memberIds);
  const weld = cloneJson(prepared.weld) as PieceFabricationWeld;

  return {
    type: 'piece.weld',
    label: 'Weld touching pieces',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const layout = state.project.layouts.find((item) => item.id === layoutId);
      if (!layout || JSON.stringify(layout) !== sourceSignature) return state;
      if (weld.memberIds.some((id) => !memberIds.has(id))) return state;

      const pieces = layout.pieces.map((piece) =>
        memberIds.has(piece.id)
          ? { ...piece, fabricationWeld: cloneJson(weld) as PieceFabricationWeld }
          : piece,
      );
      const count = pieces.filter((piece) => piece.fabricationWeld?.id === weld.id).length;
      if (count !== memberIds.size) return state;

      return {
        ...state,
        project: {
          ...state.project,
          layouts: state.project.layouts.map((item) =>
            item.id === layout.id ? { ...layout, pieces } : item,
          ),
        },
      };
    },
  };
}

export function unweldPieces(
  layoutId: string,
  requestedIds: readonly string[],
): AppCommand {
  const ids = new Set(requestedIds);
  return {
    type: 'piece.unweld',
    label: 'Unweld pieces',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const layout = state.project.layouts.find((item) => item.id === layoutId);
      if (!layout) return state;
      const weldIds = new Set(
        layout.pieces
          .filter((piece) => ids.has(piece.id))
          .map((piece) => piece.fabricationWeld?.id ?? '')
          .filter(Boolean),
      );
      if (!weldIds.size) return state;

      let pieces = layout.pieces;
      weldIds.forEach((weldId) => {
        pieces = clearPieceWeld(pieces, weldId);
      });
      if (pieces === layout.pieces) return state;

      return {
        ...state,
        project: {
          ...state.project,
          layouts: state.project.layouts.map((item) =>
            item.id === layout.id ? { ...layout, pieces } : item,
          ),
        },
      };
    },
  };
}
