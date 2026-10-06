import { rebasePieceBoundaryResize } from '../domain/pieces';
import type { ReadonlyApplicationState } from './state';

/**
 * piece.transform deliberately stays a generic geometry/pose command. When its
 * before/after state describes a one-edge Piece resize, rebase custom SHAPE
 * geometry to the new frame before the state reaches history/persistence.
 */
export function synchronizePieceBoundaryResizeInvariants(
  previous: ReadonlyApplicationState,
  current: ReadonlyApplicationState,
): ReadonlyApplicationState {
  let projectChanged = false;
  const previousLayouts = new Map(
    previous.project.layouts.map((layout) => [layout.id, layout]),
  );

  const layouts = current.project.layouts.map((layout) => {
    const previousLayout = previousLayouts.get(layout.id);
    if (!previousLayout) return layout;
    const previousPieces = new Map(
      previousLayout.pieces.map((piece) => [piece.id, piece]),
    );
    let layoutChanged = false;
    const pieces = layout.pieces.map((piece) => {
      const source = previousPieces.get(piece.id);
      if (!source) return piece;
      if (
        Math.abs(source.w - piece.w) <= 0.001 &&
        Math.abs(source.h - piece.h) <= 0.001
      ) {
        return piece;
      }

      const rebased = rebasePieceBoundaryResize(source, piece);
      if (rebased !== piece) layoutChanged = true;
      return rebased;
    });

    if (!layoutChanged) return layout;
    projectChanged = true;
    return { ...layout, pieces };
  });

  if (!projectChanged) return current;
  return {
    ...current,
    project: {
      ...current.project,
      layouts,
    },
  };
}
