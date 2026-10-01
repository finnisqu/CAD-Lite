import { round3 } from '../../core/numeric';
import type { Layout } from '../project/types';
import { cloneJson, isJsonObject } from '../types';
import { piecePoseBounds, pieceWorkspaceCanvasSize } from './geometry';
import {
  fabricationAssemblyIds,
  isBacksplashPiece,
  linkedSplashChildren,
} from './relationships';
import type { Piece } from './types';
import type { PieceDuplicationPlan } from './lifecycle';

export interface PieceClipboardPayload {
  pieces: Piece[];
  fullGroupIds: string[];
  sourceLayoutId: string;
}

function expandedClipboardIds(
  pieces: readonly Piece[],
  requested: readonly string[],
): string[] {
  const ids = new Set(
    requested.filter((id) => pieces.some((piece) => piece.id === id)),
  );

  [...ids].forEach((id) => {
    fabricationAssemblyIds(pieces, id).forEach((member) => ids.add(member));
  });

  let changed = true;
  while (changed) {
    changed = false;
    [...ids].forEach((id) => {
      linkedSplashChildren(pieces, id).forEach((child) => {
        if (ids.has(child.id)) return;
        ids.add(child.id);
        changed = true;
      });
    });
  }

  return pieces.filter((piece) => ids.has(piece.id)).map((piece) => piece.id);
}

export function createPieceClipboardPayload(
  layout: Layout,
  requested: readonly string[],
): PieceClipboardPayload | null {
  const ids = new Set(expandedClipboardIds(layout.pieces, requested));
  const pieces = layout.pieces.filter((piece) => ids.has(piece.id));
  if (!pieces.length) return null;

  const copiedCounts = new Map<string, number>();
  pieces.forEach((piece) => {
    if (isBacksplashPiece(piece) || !piece.pieceGroupId) return;
    copiedCounts.set(
      piece.pieceGroupId,
      (copiedCounts.get(piece.pieceGroupId) ?? 0) + 1,
    );
  });

  const fullGroupIds: string[] = [];
  copiedCounts.forEach((count, groupId) => {
    const total = layout.pieces.filter(
      (piece) =>
        !isBacksplashPiece(piece) && piece.pieceGroupId === groupId,
    ).length;
    if (total >= 2 && count === total) fullGroupIds.push(groupId);
  });

  return {
    pieces: cloneJson(pieces),
    fullGroupIds,
    sourceLayoutId: layout.id,
  };
}

function clipboardOffset(
  min: number,
  max: number,
  limit: number,
  desired: number,
): number {
  const size = Math.max(0, max - min);
  if (size > Math.max(0, limit)) return -min;
  return Math.max(-min, Math.min(limit - max, desired));
}

function collectStrings(value: unknown, output: Set<string>): void {
  if (typeof value === 'string') {
    output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return;
  }
  if (isJsonObject(value)) {
    Object.values(value).forEach((item) => collectStrings(item, output));
  }
}

/**
 * Prepare a clipboard Piece graph for insertion into the target Layout.
 *
 * All IDs are allocated before dispatch, so reducers remain deterministic.
 * Design and SLAB offsets are resolved independently, and cross-Layout paste
 * re-homes Pieces to the target active Area while preserving complete groups,
 * fabrication links, sinks, cutouts, and linked splashes.
 */
export function preparePieceClipboardPaste(
  target: Layout,
  payload: PieceClipboardPayload,
  pasteCount: number,
  createId: (kind: string) => string,
): PieceDuplicationPlan {
  const signature = JSON.stringify(target);
  const originals = cloneJson(payload.pieces);
  if (!originals.length) return { sourceSignature: signature, copies: [] };

  const count = Math.max(1, Math.floor(pasteCount));
  const step = Math.max(0.001, Math.abs(target.grid || 1)) * count;

  const designBounds = originals.map((piece) => piecePoseBounds(piece, 'design'));
  const dx = clipboardOffset(
    Math.min(...designBounds.map((bounds) => bounds.x)),
    Math.max(...designBounds.map((bounds) => bounds.x + bounds.w)),
    target.cw,
    step,
  );
  const dy = clipboardOffset(
    Math.min(...designBounds.map((bounds) => bounds.y)),
    Math.max(...designBounds.map((bounds) => bounds.y + bounds.h)),
    target.ch,
    step,
  );

  const slabBounds = originals.map((piece) => piecePoseBounds(piece, 'slab'));
  const slabCanvas = pieceWorkspaceCanvasSize(target, 'slab');
  const slabDx = clipboardOffset(
    Math.min(...slabBounds.map((bounds) => bounds.x)),
    Math.max(...slabBounds.map((bounds) => bounds.x + bounds.w)),
    slabCanvas.w,
    step,
  );
  const slabDy = clipboardOffset(
    Math.min(...slabBounds.map((bounds) => bounds.y)),
    Math.max(...slabBounds.map((bounds) => bounds.y + bounds.h)),
    slabCanvas.h,
    step,
  );

  const allocated = new Set<string>();
  collectStrings(target.pieces, allocated);
  const mapped = new Map<string, string>();
  const remap = (kind: string, old: string): string => {
    const key = JSON.stringify([kind, old]);
    const existing = mapped.get(key);
    if (existing) return existing;
    const id = createId(kind);
    if (!id.trim() || allocated.has(id)) {
      throw new Error('Duplicate or empty generated graph ID.');
    }
    allocated.add(id);
    mapped.set(key, id);
    return id;
  };

  const sourceIds = new Set(originals.map((piece) => piece.id));
  originals.forEach((piece) => remap('piece', piece.id));
  const fullGroups = new Set(payload.fullGroupIds);
  const sameLayout = payload.sourceLayoutId === target.id;
  const validAreas = new Set(target.areas.map((area) => area.id));
  const fallbackArea = validAreas.has(target.activeAreaId)
    ? target.activeAreaId
    : target.areas[0]?.id ?? '';
  let layer = Math.max(0, ...target.pieces.map((piece) => piece.layer)) + 1;

  const copies = originals.map((source) => {
    const piece = cloneJson(source);
    piece.id = remap('piece', source.id);
    piece.name = isBacksplashPiece(source)
      ? 'Splash'
      : `${source.name || 'Piece'} Copy`;
    piece.x = round3(source.x + dx);
    piece.y = round3(source.y + dy);
    piece.layer = layer++;
    piece.slabPlacement = {
      x: round3(source.slabPlacement.x + slabDx),
      y: round3(source.slabPlacement.y + slabDy),
      rotation: source.slabPlacement.rotation,
    };
    piece.areaId =
      sameLayout && validAreas.has(source.areaId)
        ? source.areaId
        : fallbackArea;

    if (
      source.pieceGroupId &&
      fullGroups.has(source.pieceGroupId) &&
      !isBacksplashPiece(source)
    ) {
      piece.pieceGroupId = remap('group', source.pieceGroupId);
      piece.pieceGroupName = `${source.pieceGroupName || 'Group'} Copy`;
    } else {
      piece.pieceGroupId = null;
      piece.pieceGroupName = null;
    }

    piece.attachment = source.attachment && sourceIds.has(source.attachment.parentPieceId)
      ? {
          ...source.attachment,
          parentPieceId: remap('piece', source.attachment.parentPieceId),
        }
      : null;

    piece.pieceSeams = source.pieceSeams.map((seam) => ({
      ...seam,
      id: remap('seam', seam.id),
    }));
    piece.sinks = source.sinks.map((sink) => ({
      ...sink,
      id: remap('sink', sink.id),
      fabricationSplitSinkId: sink.fabricationSplitSinkId
        ? remap('splitSink', sink.fabricationSplitSinkId)
        : null,
    }));
    piece.cutouts = source.cutouts.map((cutout) => ({
      ...cutout,
      id: remap('cutout', cutout.id),
      fabricationSplitCutoutId: cutout.fabricationSplitCutoutId
        ? remap('splitCutout', cutout.fabricationSplitCutoutId)
        : null,
    }));
    piece.assemblyLinks = source.assemblyLinks
      .filter((link) => sourceIds.has(link.matePieceId))
      .map((link) => ({
        ...link,
        id: remap('link', link.id),
        matePieceId: remap('piece', link.matePieceId),
        sourceSeamId: link.sourceSeamId
          ? remap('seam', link.sourceSeamId)
          : null,
      }));

    return piece;
  });

  return { sourceSignature: signature, copies };
}
