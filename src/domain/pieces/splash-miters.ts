import { isBacksplashPiece } from './relationships';
import { linkedSplashForEdge, splashContactEdge } from './splashes';
import type { Piece, PieceSide } from './types';

function profile(value: string | undefined): string {
  return String(value ?? '').trim();
}

/**
 * Keep the physical miter joint shared by a countertop edge and its linked
 * splash contact edge in sync, matching the v1.5.99 relationship behavior.
 * Other/custom profile strings remain untouched.
 */
export function synchronizeLinkedSplashMiterProfile(
  pieces: readonly Piece[],
  pieceId: string,
  side: PieceSide,
  nextProfile: string,
  previousProfile: string,
): Piece[] {
  const source = pieces.find((piece) => piece.id === pieceId);
  if (!source) return pieces as Piece[];

  const next = profile(nextProfile);
  const previous = profile(previousProfile);
  const nextIsMiter = next === 'miter';
  const previousWasMiter = previous === 'miter';
  if (!nextIsMiter && !previousWasMiter) return pieces as Piece[];

  if (isBacksplashPiece(source) && source.attachment?.kind === 'backsplash') {
    const sourceEdge = source.attachment.sourceEdge;
    const parentId = source.attachment.parentPieceId;
    if (!sourceEdge || !parentId || side !== splashContactEdge(sourceEdge)) {
      return pieces as Piece[];
    }
    const parent = pieces.find((piece) => piece.id === parentId);
    if (!parent) return pieces as Piece[];
    const current = profile(parent.edgeProfiles[sourceEdge]);
    const target = nextIsMiter
      ? 'miter'
      : previousWasMiter && current === 'miter'
        ? 'none'
        : current;
    if (target === current) return pieces as Piece[];
    return pieces.map((piece) =>
      piece.id === parent.id
        ? {
            ...piece,
            edgeProfiles: { ...piece.edgeProfiles, [sourceEdge]: target },
          }
        : piece,
    );
  }

  const child = linkedSplashForEdge(pieces, source.id, side);
  if (!child?.attachment?.sourceEdge) return pieces as Piece[];
  const contact = splashContactEdge(child.attachment.sourceEdge);
  const current = profile(child.edgeProfiles[contact]);
  const target = nextIsMiter
    ? 'miter'
    : previousWasMiter && current === 'miter'
      ? 'none'
      : current;
  if (target === current) return pieces as Piece[];
  return pieces.map((piece) =>
    piece.id === child.id
      ? {
          ...piece,
          edgeProfiles: { ...piece.edgeProfiles, [contact]: target },
        }
      : piece,
  );
}
