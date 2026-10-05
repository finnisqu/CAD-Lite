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
 * The projection mirrors the default SVG `preserveAspectRatio="xMidYMid meet"`
 * behavior used by CAD Lite's canvas. When the rendered client rectangle and
 * viewBox have different aspect ratios, the viewBox is uniformly scaled and
 * centered, leaving horizontal or vertical letterboxing around the rendered
 * drawing. Pointer coordinates intentionally are not clamped to the viewport.
 *
 * The caller owns DOM measurement and supplies only the numeric client rectangle,
 * keeping this geometry helper browser-independent and testable.
 */
export function clientPointToViewportPoint(
  clientPoint: Point,
  clientRect: ClientRectLike,
  viewport: XYWHRect,
): Point | null {
  if (
    clientRect.width <= 0 ||
    clientRect.height <= 0 ||
    viewport.w <= 0 ||
    viewport.h <= 0
  ) {
    return null;
  }

  const scale = Math.min(
    clientRect.width / viewport.w,
    clientRect.height / viewport.h,
  );
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const renderedWidth = viewport.w * scale;
  const renderedHeight = viewport.h * scale;
  const contentLeft =
    clientRect.left + (clientRect.width - renderedWidth) / 2;
  const contentTop =
    clientRect.top + (clientRect.height - renderedHeight) / 2;

  return {
    x: viewport.x + (clientPoint.x - contentLeft) / scale,
    y: viewport.y + (clientPoint.y - contentTop) / scale,
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
