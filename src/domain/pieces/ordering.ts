import type { Piece } from './types';

/**
 * Reorder one Cutout without changing its identity or geometry. The order is
 * durable production state and drives the Inspector's displayed sequence.
 */
export function movePieceCutoutToIndex(
  piece: Piece,
  cutoutId: string,
  targetIndex: number,
): Piece | null {
  const fromIndex = piece.cutouts.findIndex((cutout) => cutout.id === cutoutId);
  if (fromIndex < 0 || !Number.isFinite(targetIndex) || !piece.cutouts.length) {
    return null;
  }

  const toIndex = Math.max(
    0,
    Math.min(piece.cutouts.length - 1, Math.trunc(targetIndex)),
  );
  if (toIndex === fromIndex) return piece;

  const cutouts = [...piece.cutouts];
  const [moved] = cutouts.splice(fromIndex, 1);
  if (!moved) return null;
  cutouts.splice(toIndex, 0, moved);
  return { ...piece, cutouts };
}
