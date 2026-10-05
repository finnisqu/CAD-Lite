import { createPieceFabricationShape, type PieceFabricationPoint } from '../../domain/pieces';
import type { ReadonlyApplicationState } from '../state';
import type { AppCommand } from './types';

function sameShape(
  a: ReadonlyApplicationState['project']['layouts'][number]['pieces'][number]['fabricationShape'],
  b: ReadonlyApplicationState['project']['layouts'][number]['pieces'][number]['fabricationShape'],
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Set or clear an arbitrary Piece-local fabrication boundary. The mature
 * rectangle frame remains the editor/resize frame; this command changes the
 * actual countertop outline that fabrication/rendering consumers can use.
 */
export function setPieceFabricationOutline(
  layoutId: string,
  pieceId: string,
  outer: readonly PieceFabricationPoint[] | null,
): AppCommand {
  const prepared = outer?.map((point) => ({ x: point.x, y: point.y })) ?? null;

  return {
    type: 'piece.fabrication-outline',
    label: prepared ? 'Set fabrication outline' : 'Reset fabrication outline',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const layout = state.project.layouts.find((item) => item.id === layoutId);
      const piece = layout?.pieces.find((item) => item.id === pieceId);
      if (!layout || !piece) return state;

      const fabricationShape = prepared
        ? createPieceFabricationShape(prepared, piece.w, piece.h)
        : null;
      if (prepared && !fabricationShape) return state;
      if (sameShape(piece.fabricationShape, fabricationShape)) return state;

      const nextLayout = {
        ...layout,
        pieces: layout.pieces.map((item) =>
          item.id === pieceId
            ? { ...item, fabricationShape }
            : item),
      };

      return {
        ...state,
        project: {
          ...state.project,
          layouts: state.project.layouts.map((item) =>
            item.id === layoutId ? nextLayout : item),
        },
      };
    },
  };
}
