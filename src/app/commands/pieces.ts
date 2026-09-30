import type { Layout } from '../../domain/project';
import {
  createPiece, createPieceSeam, deletePieceFamily, deletePieceSeam,
  getPieceDeletionPlan, mirrorPiecesInLayout, resizePieceDimensionInLayout,
  updatePieceSeam,
  type Piece, type PieceDimension, type PieceDuplicationPlan,
  type PieceGeometry, type PieceMirrorAxis, type PiecePose,
  type PieceSeamPatch,
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


export interface PieceTransformPatch {
  id: string;
  geometry?: PieceGeometry;
  designPose?: PiecePose;
  slabPose?: PiecePose;
}

export interface TransformPiecesOptions {
  label?: string;
}

function finitePose(pose: PiecePose | undefined): PiecePose | null {
  if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.y) || !Number.isFinite(pose.rotation)) return null;
  return { x: pose.x, y: pose.y, rotation: pose.rotation };
}

function finiteGeometry(geometry: PieceGeometry | undefined): PieceGeometry | null {
  if (!geometry || geometry.kind !== 'rectangle' || !Number.isFinite(geometry.width) ||
      !Number.isFinite(geometry.height) || geometry.width < 0.25 || geometry.height < 0.25) return null;
  const max = Math.min(geometry.width, geometry.height) / 2;
  const radius = (value: number): number =>
    Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
  return {
    kind: 'rectangle', width: geometry.width, height: geometry.height,
    cornerRadii: {
      tl: radius(geometry.cornerRadii.tl), tr: radius(geometry.cornerRadii.tr),
      br: radius(geometry.cornerRadii.br), bl: radius(geometry.cornerRadii.bl),
    },
  };
}

function samePose(a: PiecePose, b: PiecePose): boolean {
  return a.x === b.x && a.y === b.y && a.rotation === b.rotation;
}

function sameGeometry(piece: Piece, geometry: PieceGeometry): boolean {
  return piece.w === geometry.width && piece.h === geometry.height &&
    piece.cornerRadii.tl === geometry.cornerRadii.tl &&
    piece.cornerRadii.tr === geometry.cornerRadii.tr &&
    piece.cornerRadii.br === geometry.cornerRadii.br &&
    piece.cornerRadii.bl === geometry.cornerRadii.bl;
}

/** Apply resolved Piece geometry/pose changes without re-snapping or rounding them. */
export function transformPieces(
  layoutId: string,
  patches: readonly PieceTransformPatch[],
  options: TransformPiecesOptions = {},
): AppCommand {
  const prepared = patches.map((patch) => ({
    id: patch.id,
    geometry: finiteGeometry(patch.geometry),
    designPose: finitePose(patch.designPose),
    slabPose: finitePose(patch.slabPose),
  }));
  const label = options.label ?? 'Transform pieces';
  return {
    type: 'piece.transform', label, history: 'record', persistence: 'save',
    reduce(state) {
      const layout = state.project.layouts.find(item => item.id === layoutId);
      if (!layout || !prepared.length) return state;
      const byId = new Map(prepared.filter(patch => patch.id.trim()).map(patch => [patch.id, patch]));
      const designMoving = new Set(prepared.filter(patch => patch.designPose).map(patch => patch.id));
      let changed = false;
      const nextPieces = layout.pieces.map(piece => {
        const patch = byId.get(piece.id);
        if (!patch) return piece;
        let next = piece;
        if (patch.geometry && !sameGeometry(next, patch.geometry)) {
          next = { ...next, w: patch.geometry.width, h: patch.geometry.height,
            cornerRadii: { ...patch.geometry.cornerRadii } };
        }
        if (patch.designPose) {
          const current = { x: next.x, y: next.y, rotation: next.rotation };
          if (!samePose(current, patch.designPose)) {
            next = { ...next, x: patch.designPose.x, y: patch.designPose.y, rotation: patch.designPose.rotation };
            if (next.attachment?.kind === 'backsplash' && next.attachment.snapped !== false &&
                !designMoving.has(next.attachment.parentPieceId) &&
                (current.x !== patch.designPose.x || current.y !== patch.designPose.y)) {
              next = { ...next, attachment: { ...next.attachment, snapped: false } };
            }
          }
        }
        if (patch.slabPose && !samePose(next.slabPlacement, patch.slabPose)) {
          next = { ...next, slabPlacement: { ...patch.slabPose } };
        }
        if (next !== piece) changed = true;
        return next;
      });
      if (!changed) return state;
      return replace(state, { ...layout, pieces: nextPieces });
    },
  };
}


export function resizePieceDimension(
  layoutId: string,
  pieceId: string,
  dimension: PieceDimension,
  value: number,
): AppCommand {
  return {
    type: 'piece.resize-dimension',
    label: 'Resize piece',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const layout = state.project.layouts.find(item => item.id === layoutId);
      if (!layout) return state;
      const current = layout.pieces.find(piece => piece.id === pieceId);
      if (!current) return state;
      const next = resizePieceDimensionInLayout(
        layout,
        pieceId,
        dimension,
        value,
      );
      if (!next || next === current) return state;
      return replace(state, {
        ...layout,
        pieces: layout.pieces.map(piece =>
          piece.id === pieceId ? next : piece),
      });
    },
  };
}

export function mirrorPieces(
  layoutId: string,
  requested: readonly string[],
  axis: PieceMirrorAxis,
): AppCommand {
  const ids = [...requested];
  return {
    type: 'piece.mirror',
    label: axis === 'h'
      ? 'Mirror pieces horizontally'
      : 'Mirror pieces vertically',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      if (
        state.session.workspace !== 'design' ||
        state.session.activeLayoutId !== layoutId
      ) {
        return state;
      }
      const layout = state.project.layouts.find(item => item.id === layoutId);
      if (!layout) return state;
      const pieces = mirrorPiecesInLayout(layout, ids, axis);
      if (pieces === layout.pieces) return state;
      return replace(state, { ...layout, pieces });
    },
  };
}


export function addPieceSeam(
  layoutId: string,
  pieceId: string,
  seamId: string,
): AppCommand {
  return editPiece(
    layoutId,
    pieceId,
    'piece.seam.add',
    'Add seam',
    (piece) => {
      const seam = createPieceSeam(piece, seamId);
      return seam
        ? { ...piece, pieceSeams: [...piece.pieceSeams, seam] }
        : piece;
    },
  );
}

export function editPieceSeam(
  layoutId: string,
  pieceId: string,
  seamId: string,
  patch: PieceSeamPatch,
): AppCommand {
  const input = { ...patch };
  return editPiece(
    layoutId,
    pieceId,
    'piece.seam.update',
    'Update seam',
    (piece) => updatePieceSeam(piece, seamId, input) ?? piece,
  );
}

export function removePieceSeam(
  layoutId: string,
  pieceId: string,
  seamId: string,
): AppCommand {
  return editPiece(
    layoutId,
    pieceId,
    'piece.seam.delete',
    'Delete seam',
    (piece) => deletePieceSeam(piece, seamId) ?? piece,
  );
}
