import type { Point } from './types';

const AUTO_STRAIGHT_ANGLE_DEGREES = 3;

export type OrthogonalConstraintAxis = 'horizontal' | 'vertical' | null;

export interface OrthogonalConstraintResult {
  point: Point;
  axis: OrthogonalConstraintAxis;
}

/**
 * Constrain a point to the nearest orthogonal axis.
 *
 * force=true preserves the strong Shift behavior. Otherwise the point only
 * straightens when it falls within weakDegrees of horizontal or vertical.
 */
export function constrainPointToAxes(
  start: Point,
  end: Point,
  force = false,
  weakDegrees = AUTO_STRAIGHT_ANGLE_DEGREES,
): OrthogonalConstraintResult {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (force) {
    return Math.abs(dx) >= Math.abs(dy)
      ? {
          point: { x: end.x, y: start.y },
          axis: 'horizontal',
        }
      : {
          point: { x: start.x, y: end.y },
          axis: 'vertical',
        };
  }

  const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
  const horizontalError = Math.min(angle, Math.abs(180 - angle));
  const verticalError = Math.abs(90 - angle);

  if (horizontalError <= weakDegrees) {
    return {
      point: { x: end.x, y: start.y },
      axis: 'horizontal',
    };
  }

  if (verticalError <= weakDegrees) {
    return {
      point: { x: start.x, y: end.y },
      axis: 'vertical',
    };
  }

  return { point: end, axis: null };
}

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

  return constrainPointToAxes(
    start,
    end,
    force,
    AUTO_STRAIGHT_ANGLE_DEGREES,
  ).point;
}
