import type { Piece } from './types';

export function pieceId(piece: Piece): string { return piece.id; }
export function pieceGroupId(piece: Piece): string | null { return piece.pieceGroupId; }
export function isBacksplashPiece(piece: Piece): boolean {
  return piece.pieceType === 'backsplash' || piece.tags.includes('backsplash') ||
    piece.attachment?.kind === 'backsplash';
}
export function backsplashParentId(piece: Piece): string | null {
  return piece.attachment?.parentPieceId ?? null;
}
export function findPiece(pieces: readonly Piece[], id: string): Piece | null {
  return pieces.find(piece => piece.id === id) ?? null;
}
export function pieceGroupMembers(pieces: readonly Piece[], id: string): Piece[] {
  const piece = findPiece(pieces, id);
  if (!piece) return [];
  return piece.pieceGroupId
    ? pieces.filter(item => !isBacksplashPiece(item) && item.pieceGroupId === piece.pieceGroupId)
    : [piece];
}
export function linkedSplashChildren(pieces: readonly Piece[], id: string): Piece[] {
  return pieces.filter(piece => backsplashParentId(piece) === id);
}
export function fabricationAssemblyIds(pieces: readonly Piece[], id: string): string[] {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const next = queue.pop();
    if (!next || seen.has(next)) continue;
    const piece = findPiece(pieces, next);
    if (!piece) continue;
    seen.add(next);
    if (isBacksplashPiece(piece)) continue;
    // Treat the physical seam as undirected, including malformed one-sided imports.
    pieces.forEach(other => {
      if (isBacksplashPiece(other)) return;
      if (piece.assemblyLinks.some(link => link.kind === 'seam' && link.matePieceId === other.id) ||
          other.assemblyLinks.some(link => link.kind === 'seam' && link.matePieceId === piece.id)) {
        queue.push(other.id);
      }
    });
  }
  return pieces.filter(piece => seen.has(piece.id)).map(pieceId);
}
export function pieceLifecycleFamilyIds(
  pieces: readonly Piece[], requested: readonly string[], workspace: 'design' | 'slab',
): string[] {
  const ids = new Set(requested.filter(id => findPiece(pieces, id)));
  if (workspace === 'design') {
    [...ids].forEach(id => fabricationAssemblyIds(pieces, id).forEach(member => ids.add(member)));
  }
  let changed = true;
  while (changed) {
    changed = false;
    pieces.forEach(piece => {
      const parent = backsplashParentId(piece);
      if (parent && ids.has(parent) && !ids.has(piece.id)) {
        ids.add(piece.id); changed = true;
      }
    });
  }
  return pieces.filter(piece => ids.has(piece.id)).map(pieceId);
}
export type PieceRelationshipIssue = {
  pieceId: string;
  kind: 'missing-parent' | 'attachment-cycle' | 'missing-mate' | 'missing-area' | 'unpaired-seam';
  targetId: string;
};
export function validatePieceRelationships(
  pieces: readonly Piece[], areaIds: readonly string[],
): PieceRelationshipIssue[] {
  const issues: PieceRelationshipIssue[] = [];
  const byId = new Map(pieces.map(piece => [piece.id, piece]));
  pieces.forEach(piece => {
    if (!areaIds.includes(piece.areaId)) issues.push({ pieceId: piece.id, kind: 'missing-area', targetId: piece.areaId });
    const parent = backsplashParentId(piece);
    if (parent && !byId.has(parent)) issues.push({ pieceId: piece.id, kind: 'missing-parent', targetId: parent });
    const seen = new Set([piece.id]);
    let cursor = parent;
    while (cursor && byId.has(cursor)) {
      if (seen.has(cursor)) {
        issues.push({ pieceId: piece.id, kind: 'attachment-cycle', targetId: cursor }); break;
      }
      seen.add(cursor);
      cursor = byId.get(cursor)?.attachment?.parentPieceId ?? null;
    }
    piece.assemblyLinks.forEach(link => {
      const mate = byId.get(link.matePieceId);
      if (!mate || mate.id === piece.id) {
        issues.push({ pieceId: piece.id, kind: 'missing-mate', targetId: link.matePieceId });
      } else if (link.kind === 'seam' && !mate.assemblyLinks.some(
        other => other.kind === 'seam' && other.id === link.id && other.matePieceId === piece.id,
      )) {
        issues.push({ pieceId: piece.id, kind: 'unpaired-seam', targetId: mate.id });
      }
    });
  });
  return issues;
}
