import {
  Point as FlattenPoint,
  Polygon as FlattenPolygon,
  Segment as FlattenSegment,
} from '@flatten-js/core';

import type { GeometryKernel } from './kernel';
import type { Point } from './types';

const EPSILON = 1e-12;

function flattenPoint(source: Point): FlattenPoint {
  return new FlattenPoint(source.x, source.y);
}

function flattenSegment(a: Point, b: Point): FlattenSegment {
  return new FlattenSegment(flattenPoint(a), flattenPoint(b));
}

function flattenPolygon(points: readonly Point[]): FlattenPolygon {
  return new FlattenPolygon(
    points.map((point) => [point.x, point.y] as [number, number]),
  );
}

function nativePointSegmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (a.x + dx * t),
    point.y - (a.y + dy * t),
  );
}

function nativePolygonDistance(
  a: readonly Point[],
  b: readonly Point[],
): number {
  if (a.length === 0 || b.length === 0) return 0;

  let best = Infinity;
  const scan = (points: readonly Point[], edges: readonly Point[]): void => {
    points.forEach((point) => {
      for (let index = 0; index < edges.length; index += 1) {
        const edgeA = edges[index];
        const edgeB = edges[(index + 1) % edges.length];
        if (!edgeA || !edgeB) continue;
        best = Math.min(
          best,
          nativePointSegmentDistance(point, edgeA, edgeB),
        );
      }
    });
  };

  scan(a, b);
  scan(b, a);
  return best;
}

function nativePolygonContainsPoint(
  polygon: readonly Point[],
  point: Point,
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) continue;

    if (
      nativePointSegmentDistance(point, previousPoint, currentPoint) <= 1e-9
    ) {
      return true;
    }

    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) *
          (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }

  return inside;
}

/**
 * Flatten.js-backed computational geometry kernel.
 *
 * CAD Lite continues to own its plain-object Point/polygon data. Conversion to
 * Flatten shapes happens only at this boundary so no third-party class leaks
 * into persistence, domain entities, or browser projections.
 */
export const flattenGeometryKernel: GeometryKernel = {
  id: 'flatten-js',
  version: '1.6.14',

  pointSegmentDistance(point, a, b) {
    if (Math.hypot(b.x - a.x, b.y - a.y) <= EPSILON) {
      return Math.hypot(point.x - a.x, point.y - a.y);
    }

    const [distance] = flattenPoint(point).distanceTo(flattenSegment(a, b));
    return Number.isFinite(distance)
      ? distance
      : nativePointSegmentDistance(point, a, b);
  },

  polygonDistance(a, b) {
    if (a.length < 3 || b.length < 3) {
      return nativePolygonDistance(a, b);
    }

    try {
      const left = flattenPolygon(a);
      const right = flattenPolygon(b);
      const firstA = a[0];
      const firstB = b[0];

      if (
        (firstB && left.contains(flattenPoint(firstB))) ||
        (firstA && right.contains(flattenPoint(firstA)))
      ) {
        return 0;
      }

      const [distance] = left.distanceTo(right);
      return Number.isFinite(distance)
        ? distance
        : nativePolygonDistance(a, b);
    } catch {
      return nativePolygonDistance(a, b);
    }
  },

  polygonContainsPoint(points, point) {
    if (points.length < 3) return false;

    try {
      return flattenPolygon(points).contains(flattenPoint(point));
    } catch {
      return nativePolygonContainsPoint(points, point);
    }
  },

  rotatePointAround(point, center, degrees) {
    const radians = degrees * Math.PI / 180;
    const rotated = flattenPoint(point).rotate(radians, flattenPoint(center));
    return { x: rotated.x, y: rotated.y };
  },

  segmentIntersections(a, b, c, d) {
    const intersections = flattenSegment(a, b).intersect(flattenSegment(c, d));
    return intersections.map((intersection) => ({
      x: intersection.x,
      y: intersection.y,
    }));
  },
};
