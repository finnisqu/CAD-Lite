import {
  createLinkedSplashPiece,
  insertLinkedSplashAfterFamily,
  linkedSplashForEdge,
  removeLinkedSplashFromEdge,
  type LinkedSplashOptions,
  type PieceSide,
} from '../../domain/pieces';
import { normalizeSelection } from '../selection';
import type { ReadonlyApplicationState } from '../state';
import type { AppCommand } from './types';

function replaceLayoutPieces(
  state: ReadonlyApplicationState,
  layoutId: string,
  pieces: ReadonlyApplicationState['project']['layouts'][number]['pieces'],
  parentId: string,
): ReadonlyApplicationState {
  const next = {
    ...state,
    project: {
      ...state.project,
      layouts: state.project.layouts.map((layout) =>
        layout.id === layoutId ? { ...layout, pieces } : layout,
      ),
    },
    session: { ...state.session },
  };
  if (state.session.activeLayoutId === layoutId) {
    next.session.selection = normalizeSelection(next, {
      kind: 'pieces',
      ids: [parentId],
    });
  }
  return next;
}

export function addLinkedSplash(
  layoutId: string,
  parentPieceId: string,
  splashId: string,
  edge: PieceSide,
  options: LinkedSplashOptions = {},
): AppCommand {
  const input = { ...options };
  return {
    type: 'piece.splash.add',
    label: 'Add splash',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      if (state.session.workspace !== 'design') return state;
      const layout = state.project.layouts.find((item) => item.id === layoutId);
      const parent = layout?.pieces.find((piece) => piece.id === parentPieceId);
      if (!layout || !parent) return state;
      const child = createLinkedSplashPiece(
        layout,
        parent,
        splashId,
        edge,
        input,
      );
      if (!child) return state;
      return replaceLayoutPieces(
        state,
        layoutId,
        insertLinkedSplashAfterFamily(layout.pieces, parent.id, child),
        parent.id,
      );
    },
  };
}

export function removeLinkedSplash(
  layoutId: string,
  parentPieceId: string,
  edge: PieceSide,
): AppCommand {
  return {
    type: 'piece.splash.remove',
    label: 'Remove splash',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      if (state.session.workspace !== 'design') return state;
      const layout = state.project.layouts.find((item) => item.id === layoutId);
      if (!layout) return state;
      const child = linkedSplashForEdge(layout.pieces, parentPieceId, edge);
      if (!child) return state;
      return replaceLayoutPieces(
        state,
        layoutId,
        removeLinkedSplashFromEdge(layout.pieces, parentPieceId, edge),
        parentPieceId,
      );
    },
  };
}
