import type { Layout } from '../../domain/project';
import {
  createPiece, deletePieceFamily, getPieceDeletionPlan,
  type Piece, type PieceDuplicationPlan,
} from '../../domain/pieces';
import { cloneJson } from '../../domain/types';
import { normalizeSelection } from '../selection';
import type { ReadonlyApplicationState, Selection } from '../state';
import type { AppCommand } from './types';

function replace(state: ReadonlyApplicationState, layout: Layout, selection?: Selection) {
  const next = {
    ...state,
    project: { ...state.project, layouts: state.project.layouts.map(item => item.id === layout.id ? layout : item) },
    session: { ...state.session },
  };
  next.session.selection = normalizeSelection(next,
    state.session.activeLayoutId === layout.id && selection ? selection : state.session.selection);
  return next;
}

export function addPiece(
  layoutId: string, id: string, options: { name?: string; areaId?: string } = {},
): AppCommand {
  const input = { ...options };
  return {
    type: 'piece.add', label: 'Add piece', history: 'record', persistence: 'save',
    reduce(state) {
      const layout = state.project.layouts.find(item => item.id === layoutId);
      if (!layout || !id.trim() || layout.pieces.some(piece => piece.id === id) ||
        (input.areaId !== undefined && !layout.areas.some(area => area.id === input.areaId))) return state;
      const piece = createPiece(layout, id, input);
      return replace(state, { ...layout, pieces: [...layout.pieces, piece] }, { kind: 'pieces', ids: [id] });
    },
  };
}

export function renamePiece(layoutId: string, id: string, name: string): AppCommand {
  const nextName = name.trim();
  return editPiece(layoutId, id, 'piece.rename', 'Rename piece',
    piece => nextName && nextName !== piece.name ? { ...piece, name: nextName } : piece);
}

/** Only independently safe presentation fields; geometry/fabrication editors follow later. */
export function updatePieceProperties(
  layoutId: string, id: string, patch: { color?: string; noFill?: boolean; fillOpacity?: number | null },
): AppCommand {
  const input = { ...patch };
  return editPiece(layoutId, id, 'piece.properties', 'Update piece appearance', piece => {
    const next = { ...piece };
    if (typeof input.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.color)) next.color = input.color;
    if (typeof input.noFill === 'boolean') next.noFill = input.noFill;
    if (input.fillOpacity === null) next.fillOpacity = null;
    else if (typeof input.fillOpacity === 'number' && Number.isFinite(input.fillOpacity)) {
      next.fillOpacity = Math.max(0, Math.min(1, input.fillOpacity));
    }
    return next.color === piece.color && next.noFill === piece.noFill && next.fillOpacity === piece.fillOpacity ? piece : next;
  });
}

function editPiece(
  layoutId: string, id: string, type: string, label: string, edit: (piece: Piece) => Piece,
): AppCommand {
  return {
    type, label, history: 'record', persistence: 'save',
    reduce(state) {
      const layout = state.project.layouts.find(item => item.id === layoutId);
      const piece = layout?.pieces.find(item => item.id === id);
      if (!layout || !piece) return state;
      const next = edit(piece);
      if (next === piece) return state;
      return replace(state, { ...layout, pieces: layout.pieces.map(item => item.id === id ? next : item) });
    },
  };
}

export function deletePieces(layoutId: string, requested: readonly string[]): AppCommand {
  const ids = [...requested];
  return {
    type: 'piece.delete', label: 'Delete pieces', history: 'record', persistence: 'save',
    reduce(state) {
      const layout = state.project.layouts.find(item => item.id === layoutId);
      if (!layout) return state;
      const plan = getPieceDeletionPlan(layout, ids, state.session.workspace);
      if (!plan.pieceIds.length) return state;
      return replace(state, deletePieceFamily(layout, plan));
    },
  };
}

export function duplicatePieces(layoutId: string, plan: PieceDuplicationPlan): AppCommand {
  const prepared = { sourceSignature: plan.sourceSignature, copies: cloneJson(plan.copies) };
  return {
    type: 'piece.duplicate', label: 'Duplicate pieces', history: 'record', persistence: 'save',
    reduce(state) {
      const layout = state.project.layouts.find(item => item.id === layoutId);
      // A stale prepared graph must not be attached to an edited source Layout.
      if (!layout || !prepared.copies.length || JSON.stringify(layout) !== prepared.sourceSignature) return state;
      const copies = cloneJson(prepared.copies);
      const ids = copies.map(piece => piece.id);
      if (new Set(ids).size !== ids.length || layout.pieces.some(piece => ids.includes(piece.id))) return state;
      return replace(state, { ...layout, pieces: [...layout.pieces, ...copies] }, { kind: 'pieces', ids });
    },
  };
}
