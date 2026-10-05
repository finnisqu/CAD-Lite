import { geometryKernel } from './engine';
import { rotatedRectBoundingSize } from './rectangle';
import type { Point, XYWHRect } from './types';

/**
 * Shortest Euclidean distance from a point to a finite line segment.
 * Backed by the active computational geometry kernel.
 */
export function distancePointToSegment(
  point: Point,
  a: Point,
  b: Point,
): number {
  return geometryKernel.pointSegmentDistance(point, a, b);
}

/**
 * Exact inclusive point containment for an axis-aligned XYWH rectangle.
 * This remains local because CAD Lite intentionally requires exact edge
 * inclusion rather than a kernel-specific floating tolerance.
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
  return geometryKernel.rotatePointAround(
    point,
    center,
    Number(degrees) || 0,
  );
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
