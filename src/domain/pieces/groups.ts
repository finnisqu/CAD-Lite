import type { Piece, PieceWorkspace } from './types';
import { isBacksplashPiece } from './relationships';
import { piecePoseBounds } from './geometry';

export type PieceGroupKind = 'group' | 'fabrication';

export interface PieceGroupStats {
  pieceCount: number;
  totalSf: number;
  width: number;
  height: number;
  sinkCount: number;
  seamCount: number;
  splashCount: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PieceGroupProjection {
  id: string;
  name: string;
  number: number;
  badge: string;
  kind: PieceGroupKind;
  areaId: string;
  memberIds: string[];
  stats: PieceGroupStats;
}

export function pieceGroupDisplayMap(
  pieces: readonly Piece[],
): Map<string, number> {
  const map = new Map<string, number>();
  let next = 1;
  pieces.forEach(piece => {
    if (
      isBacksplashPiece(piece) ||
      !piece.pieceGroupId ||
      map.has(piece.pieceGroupId)
    ) {
      return;
    }
    map.set(piece.pieceGroupId, next);
    next += 1;
  });
  return map;
}

export function pieceGroupMembersById(
  pieces: readonly Piece[],
  groupId: string,
): Piece[] {
  return pieces.filter(
    piece =>
      !isBacksplashPiece(piece) &&
      piece.pieceGroupId === groupId,
  );
}

export function pieceGroupName(
  pieces: readonly Piece[],
  groupId: string,
): string {
  const members = pieceGroupMembersById(pieces, groupId);
  const saved = members
    .map(piece => piece.pieceGroupName?.trim() ?? '')
    .find(Boolean);
  const number = pieceGroupDisplayMap(pieces).get(groupId) ?? 1;
  return saved || `Group ${number}`;
}

export function nextPieceGroupName(pieces: readonly Piece[]): string {
  let maximum = 0;
  pieces.forEach(piece => {
    const match = (piece.pieceGroupName ?? '').match(/^Group\s+(\d+)$/i);
    if (match) maximum = Math.max(maximum, Number(match[1]) || 0);
  });
  return `Group ${maximum + 1}`;
}

export function isFabricationAssemblyGroup(
  pieces: readonly Piece[],
  groupId: string,
): boolean {
  const members = pieceGroupMembersById(pieces, groupId);
  if (members.length < 2) return false;
  const ids = new Set(members.map(piece => piece.id));
  return members.some(piece =>
    piece.assemblyLinks.some(
      link =>
        link.kind === 'seam' &&
        ids.has(link.matePieceId),
    ),
  );
}

export function pieceGroupStats(
  pieces: readonly Piece[],
  groupId: string,
): PieceGroupStats | null {
  const members = pieceGroupMembersById(pieces, groupId);
  if (!members.length) return null;

  const boxes = members.map(piece => {
    const bounds = piecePoseBounds(piece, 'design');
    return {
      minX: bounds.x,
      minY: bounds.y,
      maxX: bounds.x + bounds.w,
      maxY: bounds.y + bounds.h,
    };
  });
  const minX = Math.min(...boxes.map(box => box.minX));
  const minY = Math.min(...boxes.map(box => box.minY));
  const maxX = Math.max(...boxes.map(box => box.maxX));
  const maxY = Math.max(...boxes.map(box => box.maxY));
  const memberIds = new Set(members.map(piece => piece.id));
  const splitSinks = new Set<string>();
  let sinkCount = 0;
  members.forEach(piece => {
    piece.sinks.forEach(sink => {
      if (sink.fabricationSplitSinkId) {
        if (splitSinks.has(sink.fabricationSplitSinkId)) return;
        splitSinks.add(sink.fabricationSplitSinkId);
      }
      sinkCount += 1;
    });
  });

  const convertedSeams = new Set<string>();
  let planningSeams = 0;
  members.forEach(piece => {
    planningSeams += piece.pieceSeams.length;
    piece.assemblyLinks.forEach(link => {
      if (link.kind === 'seam' && link.id) convertedSeams.add(link.id);
    });
  });

  return {
    pieceCount: members.length,
    totalSf: members.reduce(
      (sum, piece) => sum + (piece.w * piece.h) / 144,
      0,
    ),
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    sinkCount,
    seamCount: planningSeams + convertedSeams.size,
    splashCount: pieces.filter(
      piece =>
        isBacksplashPiece(piece) &&
        !!piece.attachment?.parentPieceId &&
        memberIds.has(piece.attachment.parentPieceId),
    ).length,
    minX,
    minY,
    maxX,
    maxY,
  };
}

export function createPieceGroupProjection(
  pieces: readonly Piece[],
): PieceGroupProjection[] {
  const display = pieceGroupDisplayMap(pieces);
  const result: PieceGroupProjection[] = [];
  display.forEach((number, groupId) => {
    const members = pieceGroupMembersById(pieces, groupId);
    const stats = pieceGroupStats(pieces, groupId);
    if (members.length < 2 || !stats) return;
    const kind: PieceGroupKind = isFabricationAssemblyGroup(
      pieces,
      groupId,
    )
      ? 'fabrication'
      : 'group';
    result.push({
      id: groupId,
      name: pieceGroupName(pieces, groupId),
      number,
      badge: `${kind === 'fabrication' ? 'A' : 'G'}${number}`,
      kind,
      areaId: members[0]?.areaId ?? '',
      memberIds: members.map(piece => piece.id),
      stats,
    });
  });
  return result;
}

export function selectedPieceGroupId(
  pieces: readonly Piece[],
  selectedIds: readonly string[],
  workspace: PieceWorkspace,
): string | null {
  if (workspace === 'slab' || selectedIds.length < 2) return null;
  const selected = new Set(selectedIds);
  const first = pieces.find(piece => piece.id === selectedIds[0]);
  const groupId = first?.pieceGroupId;
  if (!groupId) return null;
  const members = pieceGroupMembersById(pieces, groupId);
  return (
    members.length === selected.size &&
    members.every(piece => selected.has(piece.id))
  )
    ? groupId
    : null;
}

export function normalizePieceGroupMembership(
  pieces: readonly Piece[],
): Piece[] {
  const counts = new Map<string, number>();
  pieces.forEach(piece => {
    if (!isBacksplashPiece(piece) && piece.pieceGroupId) {
      counts.set(
        piece.pieceGroupId,
        (counts.get(piece.pieceGroupId) ?? 0) + 1,
      );
    }
  });
  return pieces.map(piece => {
    const groupId = piece.pieceGroupId;
    if (
      !groupId ||
      isBacksplashPiece(piece) ||
      (counts.get(groupId) ?? 0) >= 2
    ) {
      return piece;
    }
    return {
      ...piece,
      pieceGroupId: null,
      pieceGroupName: null,
    };
  });
}
