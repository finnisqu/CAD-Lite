import type { Piece } from '../pieces/types';
import { pieceId, pieceGroupId, isBacksplashPiece, backsplashParentId } from '../pieces/relationships';
import type { Layout } from './types';
export { pieceId, pieceGroupId, isBacksplashPiece, backsplashParentId } from '../pieces/relationships';

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function resolvedPieceAreaId(
  layout: Layout,
  piece: Piece,
): string | null {
  const validAreaIds = new Set(layout.areas.map((area) => area.id));
  const byId = new Map(
    layout.pieces
      .map((candidate) => [pieceId(candidate), candidate] as const)
      .filter(
        (entry): entry is readonly [string, Piece] =>
          entry[0] !== null,
      ),
  );

  const parentId = backsplashParentId(piece);
  const parent = parentId ? byId.get(parentId) : null;
  const requested = stringValue(parent?.areaId ?? piece.areaId);

  if (requested && validAreaIds.has(requested)) return requested;
  return layout.areas[0]?.id ?? null;
}

export function pieceIdsAssignedToArea(
  layout: Layout,
  areaId: string,
): string[] {
  return layout.pieces
    .filter((piece) => resolvedPieceAreaId(layout, piece) === areaId)
    .map(pieceId)
    .filter((id): id is string => id !== null);
}

export function visiblePieceCountForArea(
  layout: Layout,
  areaId: string,
): number {
  return layout.pieces.filter(
    (piece) =>
      !isBacksplashPiece(piece) &&
      resolvedPieceAreaId(layout, piece) === areaId,
  ).length;
}

export function resolvePieceAreaFamilyIds(
  layout: Layout,
  requestedIds: readonly string[],
): string[] {
  const byId = new Map(
    layout.pieces
      .map((piece) => [pieceId(piece), piece] as const)
      .filter(
        (entry): entry is readonly [string, Piece] =>
          entry[0] !== null,
      ),
  );
  const roots = new Set<string>();

  requestedIds.forEach((requestedId) => {
    const selected = byId.get(requestedId);
    if (!selected) return;

    const parentId = backsplashParentId(selected);
    const target = parentId ? byId.get(parentId) ?? selected : selected;
    const targetId = pieceId(target);
    if (!targetId) return;

    const groupId = pieceGroupId(target);
    if (groupId) {
      layout.pieces.forEach((candidate) => {
        const candidateId = pieceId(candidate);
        if (
          candidateId &&
          !isBacksplashPiece(candidate) &&
          pieceGroupId(candidate) === groupId
        ) {
          roots.add(candidateId);
        }
      });
      return;
    }

    roots.add(targetId);
  });

  const assigned = new Set<string>();

  roots.forEach((rootId) => {
    assigned.add(rootId);

    layout.pieces.forEach((candidate) => {
      const candidateId = pieceId(candidate);
      if (
        candidateId &&
        backsplashParentId(candidate) === rootId
      ) {
        assigned.add(candidateId);
      }
    });
  });

  return layout.pieces
    .map(pieceId)
    .filter(
      (id): id is string => id !== null && assigned.has(id),
    );
}

export interface AreaAssignmentResult {
  layout: Layout;
  assignedIds: string[];
}

export function assignPieceFamiliesToArea(
  layout: Layout,
  requestedIds: readonly string[],
  areaId: string,
): AreaAssignmentResult {
  if (!layout.areas.some((area) => area.id === areaId)) {
    return { layout, assignedIds: [] };
  }

  const assignedIds = resolvePieceAreaFamilyIds(layout, requestedIds);
  if (assignedIds.length === 0) {
    return { layout, assignedIds: [] };
  }

  const assigned = new Set(assignedIds);
  let changed = layout.activeAreaId !== areaId;

  const pieces = layout.pieces.map((piece) => {
    const id = pieceId(piece);
    if (!id || !assigned.has(id)) return piece;
    if (piece.areaId === areaId) return piece;

    changed = true;
    return {
      ...piece,
      areaId,
    };
  });

  if (!changed) return { layout, assignedIds };

  return {
    layout: {
      ...layout,
      activeAreaId: areaId,
      pieces,
    },
    assignedIds,
  };
}

export interface AreaDeletionPlan {
  areaId: string;
  areaName: string;
  fallbackAreaId: string;
  fallbackAreaName: string;
  affectedPieceIds: string[];
}

export function getAreaDeletionPlan(
  layout: Layout,
  areaId: string,
  fallbackAreaId?: string,
): AreaDeletionPlan | null {
  if (layout.areas.length <= 1) return null;

  const area = layout.areas.find((item) => item.id === areaId);
  if (!area) return null;

  const fallback =
    (fallbackAreaId
      ? layout.areas.find(
          (item) => item.id === fallbackAreaId && item.id !== areaId,
        )
      : null) ??
    layout.areas.find((item) => item.id !== areaId) ??
    null;

  if (!fallback) return null;

  return {
    areaId,
    areaName: area.name,
    fallbackAreaId: fallback.id,
    fallbackAreaName: fallback.name,
    affectedPieceIds: pieceIdsAssignedToArea(layout, areaId),
  };
}
