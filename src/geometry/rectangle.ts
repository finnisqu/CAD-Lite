import type { EdgeRect, Point, RotatedSize, Size, XYWHRect } from './types';

/**
 * Axis-aligned bounding-box size for a rotated rectangle.
 * Behavioral equivalent of v1.5.99 realSize().
 */
export function rotatedRectBoundingSize(rect: RotatedSize): Size {
  const raw = Math.abs(Number(rect.rotation || 0)) % 180;
  const degrees = raw > 90 ? 180 - raw : raw;
  const radians = degrees * Math.PI / 180;

  return {
    w: Math.abs(rect.w * Math.cos(radians)) + Math.abs(rect.h * Math.sin(radians)),
    h: Math.abs(rect.w * Math.sin(radians)) + Math.abs(rect.h * Math.cos(radians)),
  };
}

/**
 * Positive gap treats rectangles closer than the gap as overlapping.
 * Exact touching at the required gap remains non-overlapping, matching v1.5.99.
 */
export function axisAlignedRectsOverlap(a: XYWHRect, b: XYWHRect, gap = 0): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

export function rectContainsPoint(rect: EdgeRect, point: Point, epsilon = 0.001): boolean {
  return (
    point.x >= rect.left - epsilon &&
    point.x <= rect.right + epsilon &&
    point.y >= rect.top - epsilon &&
    point.y <= rect.bottom + epsilon
  );
}

export function rectContainsPolygon(
  rect: EdgeRect,
  polygon: readonly Point[],
  epsilon = 0.001,
): boolean {
  return polygon.length > 0 && polygon.every((point) => rectContainsPoint(rect, point, epsilon));
}

export interface RoundedRectCornerRadii {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

/**
 * Rounded rectangle path used by Piece rendering.
 * Values remain in caller units and are never rounded here.
 */
export function roundedRectPathCorners(
  rect: XYWHRect,
  radii: RoundedRectCornerRadii,
): string {
  const { x, y, w, h } = rect;
  const rtl = radii.tl || 0;
  const rtr = radii.tr || 0;
  const rbr = radii.br || 0;
  const rbl = radii.bl || 0;

  return [
    'M' + String(x + rtl) + ',' + String(y),
    'H' + String(x + w - rtr),
    'Q' + String(x + w) + ',' + String(y) + ' ' + String(x + w) + ',' + String(y + rtr),
    'V' + String(y + h - rbr),
    'Q' + String(x + w) + ',' + String(y + h) + ' ' + String(x + w - rbr) + ',' + String(y + h),
    'H' + String(x + rbl),
    'Q' + String(x) + ',' + String(y + h) + ' ' + String(x) + ',' + String(y + h - rbl),
    'V' + String(y + rtl),
    'Q' + String(x) + ',' + String(y) + ' ' + String(x + rtl) + ',' + String(y),
    'Z',
  ].join(' ');
}
