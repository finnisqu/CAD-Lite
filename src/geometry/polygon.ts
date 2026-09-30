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

export function pointSegmentDistance(point: Point, a: Point, b: Point): number {
  const vectorX = b.x - a.x;
  const vectorY = b.y - a.y;
  const lengthSquared = vectorX * vectorX + vectorY * vectorY;

  if (lengthSquared <= 1e-12) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - a.x) * vectorX + (point.y - a.y) * vectorY) / lengthSquared,
    ),
  );

  return Math.hypot(
    point.x - (a.x + vectorX * t),
    point.y - (a.y + vectorY * t),
  );
}

export function polygonDistance(a: readonly Point[], b: readonly Point[]): number {
  if (convexPolygonsOverlap(a, b)) return 0;

  let best = Infinity;

  const scan = (points: readonly Point[], edges: readonly Point[]): void => {
    points.forEach((point) => {
      for (let index = 0; index < edges.length; index += 1) {
        const edgeA = edges[index];
        const edgeB = edges[(index + 1) % edges.length];
        if (!edgeA || !edgeB) continue;

        best = Math.min(best, pointSegmentDistance(point, edgeA, edgeB));
      }
    });
  };

  scan(a, b);
  scan(b, a);

  return best;
}
