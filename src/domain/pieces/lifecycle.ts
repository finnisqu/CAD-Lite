import type { Layout } from '../project/types';
import { cloneJson, isJsonObject } from '../types';
import { isBacksplashPiece, pieceLifecycleFamilyIds } from './relationships';
import type { Piece } from './types';

export type PieceDeletionPlan = {
  pieceIds: string[];
  noteIds: string[];
  lineIds: string[];
};
export function getPieceDeletionPlan(
  layout: Layout, requested: readonly string[], workspace: 'design' | 'slab',
): PieceDeletionPlan {
  const pieceIds = pieceLifecycleFamilyIds(layout.pieces, requested, workspace);
  const ids = new Set(pieceIds);
  const referencesDeletedPiece = (value: unknown): boolean =>
    isJsonObject(value) && typeof value.pieceId === 'string' && ids.has(value.pieceId);
  const noteIds = layout.notes.filter(note => referencesDeletedPiece(note.radiusRef))
    .map(note => String(note.id));
  const noteSet = new Set(noteIds);
  const lineIds = layout.lines.filter(line =>
    referencesDeletedPiece(line.radiusRef) ||
    (typeof line.attachedNoteId === 'string' && noteSet.has(line.attachedNoteId)),
  ).map(line => String(line.id));
  return { pieceIds, noteIds, lineIds };
}

export function deletePieceFamily(layout: Layout, plan: PieceDeletionPlan): Layout {
  if (!plan.pieceIds.length) return layout;
  const deleted = new Set(plan.pieceIds);
  const survivors = layout.pieces.filter(piece => !deleted.has(piece.id));
  const groupCounts = new Map<string, number>();
  survivors.forEach(piece => {
    if (piece.pieceGroupId && !isBacksplashPiece(piece)) {
      groupCounts.set(piece.pieceGroupId, (groupCounts.get(piece.pieceGroupId) ?? 0) + 1);
    }
  });
  return {
    ...layout,
    pieces: survivors.map(piece => ({
      ...piece,
      attachment: piece.attachment && deleted.has(piece.attachment.parentPieceId) ? null : piece.attachment,
      assemblyLinks: piece.assemblyLinks.filter(link => !deleted.has(link.matePieceId)),
      pieceGroupId: piece.pieceGroupId && (groupCounts.get(piece.pieceGroupId) ?? 0) < 2 ? null : piece.pieceGroupId,
      pieceGroupName: piece.pieceGroupId && (groupCounts.get(piece.pieceGroupId) ?? 0) < 2 ? null : piece.pieceGroupName,
    })),
    notes: layout.notes.filter(note => !plan.noteIds.includes(String(note.id))),
    lines: layout.lines.filter(line => !plan.lineIds.includes(String(line.id))),
  };
}

export type PieceDuplicationPlan = {
  sourceSignature: string;
  copies: Piece[];
};

function bounds(piece: Piece): { w: number; h: number } {
  const angle = piece.rotation * Math.PI / 180;
  return {
    w: Math.abs(piece.w * Math.cos(angle)) + Math.abs(piece.h * Math.sin(angle)),
    h: Math.abs(piece.w * Math.sin(angle)) + Math.abs(piece.h * Math.cos(angle)),
  };
}
function duplicateOffset(min: number, max: number, limit: number, step: number): number {
  const next = max + step > limit ? -step : step;
  return min + next < 0 || max + next > limit ? 0 : next;
}

/** Called before dispatch: all IDs are allocated here, never by a reducer.
 * Same-layout structural duplication only; clipboard/cross-layout UI is a later batch.
 */
export function preparePieceDuplication(
  layout: Layout, requested: readonly string[], workspace: 'design' | 'slab',
  createId: (kind: string) => string,
): PieceDuplicationPlan {
  const ids = new Set(pieceLifecycleFamilyIds(layout.pieces, requested, workspace));
  const originals = layout.pieces.filter(piece => ids.has(piece.id));
  const signature = JSON.stringify(layout);
  if (!originals.length) return { sourceSignature: signature, copies: [] };
  const allocated = new Set<string>();
  // Include every string identifier in existing data so new graph IDs cannot alias it.
  const collect = (value: unknown): void => {
    if (typeof value === 'string') allocated.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (isJsonObject(value)) Object.values(value).forEach(collect);
  };
  collect(layout.pieces);
  const mapped = new Map<string, string>();
  const remap = (kind: string, old: string): string => {
    const key = JSON.stringify([kind, old]);
    const existing = mapped.get(key);
    if (existing) return existing;
    const id = createId(kind);
    if (!id.trim() || allocated.has(id)) throw new Error('Duplicate or empty generated graph ID.');
    allocated.add(id); mapped.set(key, id); return id;
  };
  originals.forEach(piece => remap('piece', piece.id));
  const fullGroups = new Set(originals.filter(piece => piece.pieceGroupId && !isBacksplashPiece(piece))
    .map(piece => piece.pieceGroupId).filter((id): id is string => id !== null)
    .filter(id => {
      const members = layout.pieces.filter(piece => piece.pieceGroupId === id && !isBacksplashPiece(piece));
      return members.length >= 2 && members.every(piece => ids.has(piece.id));
    }));
  const boxes = originals.map(piece => ({ piece, size: bounds(piece) }));
  const step = Math.max(.001, Math.abs(layout.grid || 1));
  const dx = duplicateOffset(Math.min(...originals.map(p => p.x)), Math.max(...boxes.map(b => b.piece.x + b.size.w)), layout.cw, step);
  const dy = duplicateOffset(Math.min(...originals.map(p => p.y)), Math.max(...boxes.map(b => b.piece.y + b.size.h)), layout.ch, step);
  let layer = Math.max(0, ...layout.pieces.map(piece => piece.layer)) + 1;
  const copies = originals.map(source => {
    const piece = cloneJson(source);
    piece.id = remap('piece', source.id);
    piece.name = isBacksplashPiece(source) ? 'Splash' : (source.name || 'Piece') + ' Copy';
    piece.x += dx; piece.y += dy; piece.layer = layer++;
    const slabBounds = bounds({ ...piece, rotation: piece.slabPlacement.rotation });
    const slabW = typeof layout.extra.slabCW === 'number' ? layout.extra.slabCW : layout.cw;
    const slabH = typeof layout.extra.slabCH === 'number' ? layout.extra.slabCH : layout.ch;
    piece.slabPlacement.x = Math.max(0, Math.min(piece.slabPlacement.x + dx, slabW - slabBounds.w));
    piece.slabPlacement.y = Math.max(0, Math.min(piece.slabPlacement.y + dy, slabH - slabBounds.h));
    if (source.pieceGroupId && fullGroups.has(source.pieceGroupId) && !isBacksplashPiece(source)) {
      piece.pieceGroupId = remap('group', source.pieceGroupId);
      piece.pieceGroupName = (source.pieceGroupName || 'Group') + ' Copy';
    } else {
      piece.pieceGroupId = null; piece.pieceGroupName = null;
    }
    if (piece.attachment) {
      piece.attachment = ids.has(piece.attachment.parentPieceId)
        ? { ...piece.attachment, parentPieceId: remap('piece', piece.attachment.parentPieceId) }
        : null;
    }
    piece.pieceSeams = piece.pieceSeams.map(seam => ({ ...seam, id: remap('seam', seam.id) }));
    piece.sinks = piece.sinks.map(sink => ({
      ...sink, id: remap('sink', sink.id),
      ...(typeof sink.fabricationSplitSinkId === 'string'
        ? { fabricationSplitSinkId: remap('splitSink', sink.fabricationSplitSinkId) } : {}),
    }));
    piece.cutouts = piece.cutouts.map(cutout => ({
      ...cutout, id: remap('cutout', cutout.id),
      ...(typeof cutout.fabricationSplitCutoutId === 'string'
        ? { fabricationSplitCutoutId: remap('splitCutout', cutout.fabricationSplitCutoutId) } : {}),
    }));
    piece.assemblyLinks = piece.assemblyLinks.filter(link => ids.has(link.matePieceId)).map(link => ({
      ...link, id: remap('link', link.id), matePieceId: remap('piece', link.matePieceId),
      sourceSeamId: link.sourceSeamId ? remap('seam', link.sourceSeamId) : null,
    }));
    return piece;
  });
  return { sourceSignature: signature, copies };
}
