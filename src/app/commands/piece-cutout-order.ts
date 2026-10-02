import { movePieceCutoutToIndex } from '../../domain/pieces';
import type { ReadonlyApplicationState } from '../state';
import type { AppCommand } from './types';

export function reorderPieceCutout(
  layoutId: string,
  pieceId: string,
  cutoutId: string,
  targetIndex: number,
): AppCommand {
  return {
    type: 'piece.cutout.reorder',
    label: 'Reorder cutout',
    history: 'record',
    persistence: 'save',
    reduce(state: ReadonlyApplicationState) {
      const layout = state.project.layouts.find((item) => item.id === layoutId);
      const piece = layout?.pieces.find((item) => item.id === pieceId);
      if (!layout || !piece) return state;

      const nextPiece = movePieceCutoutToIndex(piece, cutoutId, targetIndex);
      if (!nextPiece || nextPiece === piece) return state;

      return {
        ...state,
        project: {
          ...state.project,
          layouts: state.project.layouts.map((item) =>
            item.id === layout.id
              ? {
                  ...layout,
                  pieces: layout.pieces.map((candidate) =>
                    candidate.id === piece.id ? nextPiece : candidate,
                  ),
                }
              : item,
          ),
        },
      };
    },
  };
}
