import { geometryKernel } from './engine';
import type { Axis, Point, Projection } from './types';

export function polygonCenter(polygon: readonly Point[]): Point {
  if (polygon.length === 0) return { x: 0, y: 0 };

  return polygon.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x / polygon.length,
      y: accumulator.y + point.y / polygon.length,
    }),
    { x: 0, y: 0 },
  );
}

export function polygonAxes(polygon: readonly Point[]): Axis[] {
  const axes: Axis[] = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (!a || !b) continue;

    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const length = Math.hypot(edgeX, edgeY);
    if (length <= 1e-9) continue;

    axes.push({
      x: -edgeY / length,
      y: edgeX / length,
    });
  }

  return axes;
}

export function projectPolygon(polygon: readonly Point[], axis: Axis): Projection {
  let min = Infinity;
  let max = -Infinity;

  polygon.forEach((point) => {
    const projection = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  });

  return { min, max };
}

/**
 * Convex SAT overlap check.
 *
 * Touching edges are intentionally not considered overlap. CAD Lite uses
 * explicit cut-clearance rules for required fabrication spacing.
 *
 * This remains a CAD Lite policy calculation for now rather than a kernel
 * primitive because the epsilon represents fabrication clearance semantics,
 * not merely topological polygon intersection.
 */
export function convexPolygonsOverlap(
  a: readonly Point[],
  b: readonly Point[],
  epsilon = 0.0005,
): boolean {
  const axes = [...polygonAxes(a), ...polygonAxes(b)];

  for (const axis of axes) {
    const projectionA = projectPolygon(a, axis);
    const projectionB = projectPolygon(b, axis);

    if (
      projectionA.max <= projectionB.min + epsilon ||
      projectionB.max <= projectionA.min + epsilon
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Computational point-to-segment distance supplied by the active geometry
 * kernel. The plain Point API remains unchanged for CAD Lite callers.
 */
export function pointSegmentDistance(point: Point, a: Point, b: Point): number {
  return geometryKernel.pointSegmentDistance(point, a, b);
}

/**
 * Distance between polygonal CAD entities. Overlap/containment returns zero.
 */
export function polygonDistance(a: readonly Point[], b: readonly Point[]): number {
  if (convexPolygonsOverlap(a, b)) return 0;
  return geometryKernel.polygonDistance(a, b);
}

export function polygonContainsPoint(
  polygon: readonly Point[],
  point: Point,
): boolean {
  return geometryKernel.polygonContainsPoint(polygon, point);
}

export function segmentIntersections(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): Point[] {
  return geometryKernel.segmentIntersections(a, b, c, d);
}
