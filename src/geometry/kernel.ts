import type { Point } from './types';

export type PolygonBooleanOperation =
  | 'union'
  | 'difference'
  | 'intersection'
  | 'xor';

export type PolygonJoinStyle = 'miter' | 'round' | 'square';

/**
 * A topological polygon result expressed in CAD Lite inch coordinates.
 *
 * Clipper internally represents outer contours and holes as a PolyTree. CAD
 * Lite keeps that topology explicit at the engine boundary rather than leaking
 * Clipper path orientation rules into domain/browser code.
 */
export interface PolygonRegion {
  outer: Point[];
  holes: Point[][];
}

export interface PolygonOffsetOptions {
  join?: PolygonJoinStyle;
  miterLimit?: number;
  arcTolerance?: number;
}

export interface AnalyticalGeometryKernel {
  readonly id: string;
  readonly version: string;

  pointSegmentDistance(point: Point, a: Point, b: Point): number;
  polygonDistance(a: readonly Point[], b: readonly Point[]): number;
  polygonContainsPoint(polygon: readonly Point[], point: Point): boolean;
  rotatePointAround(point: Point, center: Point, degrees: number): Point;
  segmentIntersections(a: Point, b: Point, c: Point, d: Point): Point[];
}

/**
 * Stable boundary between CAD Lite's domain geometry and the underlying
 * computational geometry implementation.
 *
 * Callers should depend on this interface rather than importing a third-party
 * kernel directly. That keeps persisted CAD Lite data and browser surfaces
 * independent from the engine choice.
 */
export interface GeometryKernel extends AnalyticalGeometryKernel {
  /**
   * Robust polygon topology operation. These methods are async because the
   * Clipper WebAssembly/Asm.js engine is loaded once, lazily, on first use.
   */
  polygonBoolean(
    subjects: readonly (readonly Point[])[],
    clips: readonly (readonly Point[])[],
    operation: PolygonBooleanOperation,
  ): Promise<PolygonRegion[]>;

  polygonOffset(
    polygons: readonly (readonly Point[])[],
    delta: number,
    options?: PolygonOffsetOptions,
  ): Promise<PolygonRegion[]>;
}

export interface GeometryKernelInfo {
  id: string;
  version: string;
}
