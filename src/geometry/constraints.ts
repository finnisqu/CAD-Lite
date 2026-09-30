import type { Point } from './types';

const AUTO_STRAIGHT_ANGLE_DEGREES = 3;
const AUTO_STRAIGHT_TANGENT = Math.tan(AUTO_STRAIGHT_ANGLE_DEGREES * Math.PI / 180);

/**
 * Behavioral equivalent of v1.5.99 constrainDrawPoint().
 *
 * Automatic straightening is intentionally gentle at 3 degrees. force=true
 * preserves the existing Shift behavior and constrains to the nearest axis.
 */
export function constrainDrawPoint(start: Point | null, end: Point, force = false): Point {
  if (!start) return end;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX < 0.001 && absY < 0.001) return end;

  if (force) {
    return absX >= absY
      ? { x: end.x, y: start.y }
      : { x: start.x, y: end.y };
  }

  if (absX > 0 && absY / absX <= AUTO_STRAIGHT_TANGENT) {
    return { x: end.x, y: start.y };
  }

  if (absY > 0 && absX / absY <= AUTO_STRAIGHT_TANGENT) {
    return { x: start.x, y: end.y };
  }

  return end;
}
