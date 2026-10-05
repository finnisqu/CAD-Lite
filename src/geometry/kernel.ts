import type { Point } from './types';

/**
 * Stable boundary between CAD Lite's domain geometry and the underlying
 * computational geometry implementation.
 *
 * Callers should depend on this interface rather than importing a third-party
 * kernel directly. That keeps persisted CAD Lite data and browser surfaces
 * independent from the engine choice.
 */
export interface GeometryKernel {
  readonly id: string;
  readonly version: string;

  pointSegmentDistance(point: Point, a: Point, b: Point): number;
  polygonDistance(a: readonly Point[], b: readonly Point[]): number;
  polygonContainsPoint(polygon: readonly Point[], point: Point): boolean;
  rotatePointAround(point: Point, center: Point, degrees: number): Point;
  segmentIntersections(a: Point, b: Point, c: Point, d: Point): Point[];
}

export interface GeometryKernelInfo {
  id: string;
  version: string;
}
