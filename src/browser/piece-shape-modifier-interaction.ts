import { round3 } from '../core/numeric';
import type { PieceShapeModifier } from '../domain/pieces';

export type PieceShapeModifierHandle =
  | 'move'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'nw';

export interface PieceShapeModifierRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_MIN_SIZE = 0.125;

export function dragPieceShapeModifier(
  source: Pick<PieceShapeModifier, 'x' | 'y' | 'w' | 'h'>,
  handle: PieceShapeModifierHandle,
  dx: number,
  dy: number,
  minSize = DEFAULT_MIN_SIZE,
): PieceShapeModifierRect {
  const minimum = Math.max(0.001, Number.isFinite(minSize) ? minSize : DEFAULT_MIN_SIZE);
  if (handle === 'move') {
    return {
      x: round3(source.x + dx),
      y: round3(source.y + dy),
      w: round3(source.w),
      h: round3(source.h),
    };
  }

  let left = source.x;
  let right = source.x + source.w;
  let top = source.y;
  let bottom = source.y + source.h;

  if (handle.includes('w')) {
    left = Math.min(right - minimum, source.x + dx);
  }
  if (handle.includes('e')) {
    right = Math.max(left + minimum, source.x + source.w + dx);
  }
  if (handle.includes('n')) {
    top = Math.min(bottom - minimum, source.y + dy);
  }
  if (handle.includes('s')) {
    bottom = Math.max(top + minimum, source.y + source.h + dy);
  }

  return {
    x: round3(left),
    y: round3(top),
    w: round3(right - left),
    h: round3(bottom - top),
  };
}

export function nudgePieceShapeModifier(
  source: Pick<PieceShapeModifier, 'x' | 'y' | 'w' | 'h'>,
  dx: number,
  dy: number,
): PieceShapeModifierRect {
  return {
    x: round3(source.x + dx),
    y: round3(source.y + dy),
    w: round3(source.w),
    h: round3(source.h),
  };
}
