import type { Point, XYWHRect } from './types';

export interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function normalizeViewportScale(scale: unknown): number {
  return Math.max(0.001, Math.abs(Number(scale) || 1));
}

export function screenDistanceToWorld(
  distance: number,
  scale: unknown,
): number {
  return distance / normalizeViewportScale(scale);
}

/**
 * Project a point from client coordinates into an arbitrary viewport rectangle.
 *
 * The caller owns DOM measurement and supplies only the numeric client rectangle,
 * keeping this geometry helper browser-independent and testable.
 */
export function clientPointToViewportPoint(
  clientPoint: Point,
  clientRect: ClientRectLike,
  viewport: XYWHRect,
): Point | null {
  if (clientRect.width <= 0 || clientRect.height <= 0) return null;

  return {
    x:
      viewport.x +
      ((clientPoint.x - clientRect.left) / clientRect.width) * viewport.w,
    y:
      viewport.y +
      ((clientPoint.y - clientRect.top) / clientRect.height) * viewport.h,
  };
}

export function nextViewportScale(
  current: number,
  direction: -1 | 1,
  step: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number.isFinite(current) ? current : minimum;
  return Math.max(minimum, Math.min(maximum, value + direction * step));
}

export function anchoredViewportScrollOffset(
  scrollOffset: number,
  localPointer: number,
  oldScale: number,
  newScale: number,
): number {
  const worldCoordinate = screenDistanceToWorld(
    scrollOffset + localPointer,
    oldScale,
  );
  return Math.max(0, worldCoordinate * newScale - localPointer);
}
