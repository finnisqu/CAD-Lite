import { round3 } from '../../core/numeric';
import { rotateVector } from '../../geometry';
import {
  createPieceFabricationShape,
  pieceFabricationOutline,
  pieceHasCustomFabricationShape,
} from './fabrication-shape';
import {
  pieceShapeRecipe,
  withPieceShapeRecipe,
  type PieceShapeModifier,
  type PieceShapeRecipe,
} from './shape-modifiers';
import { pieceCenterFromGeometryPose } from './geometry';
import { pieceGeometry, piecePose } from './factory';
import type {
  Piece,
  PieceFabricationPoint,
  PieceGeometry,
  PiecePose,
  PieceSide,
} from './types';

const BOUNDARY_EPSILON = 0.001;
const MIN_MODIFIER_SPAN = 0.125;

function near(value: number, target: number): boolean {
  return Math.abs(value - target) <= BOUNDARY_EPSILON;
}

function resizedPoint(
  point: PieceFabricationPoint,
  side: PieceSide,
  oldWidth: number,
  oldHeight: number,
  nextWidth: number,
  nextHeight: number,
): PieceFabricationPoint {
  const dx = nextWidth - oldWidth;
  const dy = nextHeight - oldHeight;
  let x = point.x;
  let y = point.y;

  if (side === 'right' && near(point.x, oldWidth)) x = nextWidth;
  if (side === 'left') x = near(point.x, 0) ? 0 : point.x + dx;
  if (side === 'bottom' && near(point.y, oldHeight)) y = nextHeight;
  if (side === 'top') y = near(point.y, 0) ? 0 : point.y + dy;

  return {
    x: round3(Math.max(0, Math.min(nextWidth, x))),
    y: round3(Math.max(0, Math.min(nextHeight, y))),
  };
}

function touchesVerticalBoundary(
  modifier: PieceShapeModifier,
  boundary: number,
): boolean {
  return (
    modifier.x <= boundary + BOUNDARY_EPSILON &&
    modifier.x + modifier.w >= boundary - BOUNDARY_EPSILON
  );
}

function touchesHorizontalBoundary(
  modifier: PieceShapeModifier,
  boundary: number,
): boolean {
  return (
    modifier.y <= boundary + BOUNDARY_EPSILON &&
    modifier.y + modifier.h >= boundary - BOUNDARY_EPSILON
  );
}

function resizedModifier(
  modifier: PieceShapeModifier,
  side: PieceSide,
  oldWidth: number,
  oldHeight: number,
  nextWidth: number,
  nextHeight: number,
): PieceShapeModifier {
  const dx = nextWidth - oldWidth;
  const dy = nextHeight - oldHeight;
  let x = modifier.x;
  let y = modifier.y;
  let w = modifier.w;
  let h = modifier.h;

  if (side === 'right') {
    if (touchesVerticalBoundary(modifier, oldWidth)) {
      w = Math.max(MIN_MODIFIER_SPAN, modifier.w + dx);
    }
  } else if (side === 'left') {
    if (touchesVerticalBoundary(modifier, 0)) {
      w = Math.max(MIN_MODIFIER_SPAN, modifier.w + dx);
    } else {
      x = modifier.x + dx;
    }
  } else if (side === 'bottom') {
    if (touchesHorizontalBoundary(modifier, oldHeight)) {
      h = Math.max(MIN_MODIFIER_SPAN, modifier.h + dy);
    }
  } else if (side === 'top') {
    if (touchesHorizontalBoundary(modifier, 0)) {
      h = Math.max(MIN_MODIFIER_SPAN, modifier.h + dy);
    } else {
      y = modifier.y + dy;
    }
  }

  return {
    ...modifier,
    x: round3(x),
    y: round3(y),
    w: round3(w),
    h: round3(h),
  };
}

function resizedRecipe(
  piece: Piece,
  side: PieceSide,
  nextWidth: number,
  nextHeight: number,
): PieceShapeRecipe | null {
  const recipe = pieceShapeRecipe(piece);
  if (!recipe) return null;

  return {
    version: 1,
    frameWidth: round3(nextWidth),
    frameHeight: round3(nextHeight),
    baseOuter: recipe.baseOuter.map((point) =>
      resizedPoint(
        point,
        side,
        piece.w,
        piece.h,
        nextWidth,
        nextHeight,
      ),
    ),
    modifiers: recipe.modifiers.map((modifier) =>
      resizedModifier(
        modifier,
        side,
        piece.w,
        piece.h,
        nextWidth,
        nextHeight,
      ),
    ),
  };
}

/**
 * Resize one Piece boundary without rubber-scaling the rest of a custom shape.
 * Geometry on the opposite/interior side stays fixed; construction modifiers
 * only grow/shrink when they actually touch the boundary being moved.
 */
export function pieceBoundaryResizeOutline(
  piece: Piece,
  side: PieceSide,
  nextWidth: number,
  nextHeight: number,
): PieceFabricationPoint[] {
  const width = Math.max(0.25, nextWidth);
  const height = Math.max(0.25, nextHeight);
  return pieceFabricationOutline(piece).map((point) =>
    resizedPoint(point, side, piece.w, piece.h, width, height),
  );
}

/**
 * Infer which single edge moved from the signed size delta and center shift.
 * Comparing against +/- delta/2 keeps the grabbed edge authoritative in both
 * directions: a right edge dragged left is still a right-edge resize.
 */
export function inferPieceBoundaryResizeSide(
  piece: Piece,
  geometry: PieceGeometry,
  pose: PiecePose,
): PieceSide | null {
  const widthDelta = geometry.width - piece.w;
  const heightDelta = geometry.height - piece.h;
  const widthChanged = Math.abs(widthDelta) > BOUNDARY_EPSILON;
  const heightChanged = Math.abs(heightDelta) > BOUNDARY_EPSILON;
  if (widthChanged === heightChanged) return null;
  if (Math.abs(pose.rotation - piece.rotation) > BOUNDARY_EPSILON) return null;

  const oldCenter = pieceCenterFromGeometryPose(
    pieceGeometry(piece),
    piecePose(piece, 'design'),
  );
  const nextCenter = pieceCenterFromGeometryPose(geometry, pose);
  const localShift = rotateVector(
    nextCenter.x - oldCenter.x,
    nextCenter.y - oldCenter.y,
    -piece.rotation,
  );

  if (widthChanged) {
    const rightError = Math.abs(localShift.x - widthDelta / 2);
    const leftError = Math.abs(localShift.x + widthDelta / 2);
    return rightError <= leftError ? 'right' : 'left';
  }

  const bottomError = Math.abs(localShift.y - heightDelta / 2);
  const topError = Math.abs(localShift.y + heightDelta / 2);
  return bottomError <= topError ? 'bottom' : 'top';
}

/**
 * Rebase a completed one-edge resize so future renders and SHAPE edits use the
 * new frame directly instead of scaling the old frame into it.
 */
export function rebasePieceBoundaryResize(
  source: Piece,
  resized: Piece,
): Piece {
  if (
    !pieceHasCustomFabricationShape(source) &&
    !pieceShapeRecipe(source)
  ) {
    return resized;
  }

  const side = inferPieceBoundaryResizeSide(
    source,
    pieceGeometry(resized),
    piecePose(resized, 'design'),
  );
  if (!side) return resized;

  const outline = pieceBoundaryResizeOutline(
    source,
    side,
    resized.w,
    resized.h,
  );
  const fabricationShape = createPieceFabricationShape(
    outline,
    resized.w,
    resized.h,
  );
  if (!fabricationShape) return resized;

  let next: Piece = {
    ...resized,
    fabricationShape,
  };
  const recipe = resizedRecipe(source, side, resized.w, resized.h);
  if (recipe) next = withPieceShapeRecipe(next, recipe);
  return next;
}
