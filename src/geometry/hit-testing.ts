import { rotatedRectBoundingSize } from './rectangle';
import type { Point, XYWHRect } from './types';
import { rotateVector } from './vector';

/**
 * Shortest Euclidean distance from a point to a finite line segment.
 */
export function distancePointToSegment(
  point: Point,
  a: Point,
  b: Point,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 <= 1e-12) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2),
  );
  return Math.hypot(
    point.x - (a.x + dx * t),
    point.y - (a.y + dy * t),
  );
}

/**
 * Exact inclusive point containment for an axis-aligned XYWH rectangle.
 */
export function xywhRectContainsPoint(
  rect: XYWHRect,
  point: Point,
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

/**
 * Rotate a point around an arbitrary center without mutating either input.
 */
export function rotatePointAround(
  point: Point,
  center: Point,
  degrees: unknown,
): Point {
  const offset = rotateVector(
    point.x - center.x,
    point.y - center.y,
    degrees,
  );
  return {
    x: center.x + offset.x,
    y: center.y + offset.y,
  };
}

/**
 * Axis-aligned bounds enclosing an XYWH rectangle rotated around its center.
 */
export function rotatedRectBounds(
  rect: XYWHRect,
  rotation: unknown,
): XYWHRect {
  const size = rotatedRectBoundingSize({
    w: rect.w,
    h: rect.h,
    rotation: Number(rotation) || 0,
  });
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  return {
    x: centerX - size.w / 2,
    y: centerY - size.h / 2,
    w: size.w,
    h: size.h,
  };
}
