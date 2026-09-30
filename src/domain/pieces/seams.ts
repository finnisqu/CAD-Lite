import { clamp, round3 } from '../../core/numeric';
import type { Piece, PieceSeam, PieceSeamOrientation, PieceSeamReference } from './types';

export interface PieceSeamPatch {
  orientation?: PieceSeamOrientation;
  reference?: PieceSeamReference;
  offset?: number;
}

export function pieceSeamMaximum(
  piece: Pick<Piece, 'w' | 'h'>,
  orientation: PieceSeamOrientation,
): number {
  return orientation === 'horizontal'
    ? Math.max(0, piece.h)
    : Math.max(0, piece.w);
}

export function pieceSeamReferences(
  orientation: PieceSeamOrientation,
): readonly PieceSeamReference[] {
  return orientation === 'horizontal'
    ? ['top', 'bottom'] as const
    : ['left', 'right'] as const;
}

export function isPieceSeamReference(
  orientation: PieceSeamOrientation,
  reference: unknown,
): reference is PieceSeamReference {
  return pieceSeamReferences(orientation).includes(
    reference as PieceSeamReference,
  );
}

export function pieceSeamLocalCoordinate(
  piece: Pick<Piece, 'w' | 'h'>,
  seam: Pick<PieceSeam, 'orientation' | 'reference' | 'offset'>,
): number {
  const maximum = pieceSeamMaximum(piece, seam.orientation);
  const offset = clamp(seam.offset, 0, maximum);

  if (seam.orientation === 'horizontal') {
    return seam.reference === 'bottom'
      ? maximum - offset
      : offset;
  }

  return seam.reference === 'right'
    ? maximum - offset
    : offset;
}

export function createPieceSeam(
  piece: Pick<Piece, 'w' | 'pieceSeams'>,
  id: string,
): PieceSeam | null {
  const nextId = id.trim();
  if (
    !nextId ||
    piece.pieceSeams.some((seam) => seam.id === nextId)
  ) {
    return null;
  }

  return {
    id: nextId,
    orientation: 'vertical',
    reference: 'left',
    offset: round3(Math.max(0, piece.w / 2)),
  };
}

export function updatePieceSeam(
  piece: Piece,
  seamId: string,
  patch: PieceSeamPatch,
): Piece | null {
  const current = piece.pieceSeams.find((seam) => seam.id === seamId);
  if (!current) return null;

  let orientation = current.orientation;
  let reference = current.reference;
  let offset = current.offset;

  if (
    patch.orientation === 'horizontal' ||
    patch.orientation === 'vertical'
  ) {
    if (patch.orientation !== orientation) {
      orientation = patch.orientation;
      reference = orientation === 'horizontal' ? 'top' : 'left';
      offset = round3(
        clamp(offset, 0, pieceSeamMaximum(piece, orientation)),
      );
    }
  }

  if (
    patch.reference !== undefined &&
    isPieceSeamReference(orientation, patch.reference)
  ) {
    reference = patch.reference;
  }

  if (
    patch.offset !== undefined &&
    Number.isFinite(patch.offset)
  ) {
    offset = round3(
      clamp(
        patch.offset,
        0,
        pieceSeamMaximum(piece, orientation),
      ),
    );
  }

  if (
    orientation === current.orientation &&
    reference === current.reference &&
    offset === current.offset
  ) {
    return piece;
  }

  return {
    ...piece,
    pieceSeams: piece.pieceSeams.map((seam) =>
      seam.id === seamId
        ? { ...seam, orientation, reference, offset }
        : seam),
  };
}

export function deletePieceSeam(
  piece: Piece,
  seamId: string,
): Piece | null {
  if (!piece.pieceSeams.some((seam) => seam.id === seamId)) {
    return null;
  }
  return {
    ...piece,
    pieceSeams: piece.pieceSeams.filter((seam) => seam.id !== seamId),
  };
}
