import * as clipperLib from 'js-angusj-clipper';

import type {
  PolygonBooleanOperation,
  PolygonJoinStyle,
  PolygonOffsetOptions,
  PolygonRegion,
} from './kernel';
import type { Point } from './types';

/**
 * Clipper is intentionally integer-only for numerical robustness. CAD Lite
 * stores geometry in inches, so 10,000 internal units per inch preserves
 * 0.0001 in precision while keeping normal countertop coordinates far inside
 * Clipper's fast integer range.
 */
export const CLIPPER_COORDINATE_SCALE = 10_000;
export const CLIPPER_TOPOLOGY_VERSION = '1.3.1';

let clipperPromise: Promise<clipperLib.ClipperLibWrapper> | null = null;

function loadClipper(): Promise<clipperLib.ClipperLibWrapper> {
  if (!clipperPromise) {
    clipperPromise = clipperLib
      .loadNativeClipperLibInstanceAsync(
        clipperLib.NativeClipperLibRequestedFormat.WasmWithAsmJsFallback,
      )
      .catch((error: unknown) => {
        clipperPromise = null;
        throw error;
      });
  }
  return clipperPromise;
}

function scaledCoordinate(value: number): number {
  const scaled = Math.round(value * CLIPPER_COORDINATE_SCALE);
  if (!Number.isSafeInteger(scaled)) {
    throw new RangeError('CAD Lite geometry exceeds Clipper coordinate range.');
  }
  return scaled;
}

function sameIntegerPoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return a.x === b.x && a.y === b.y;
}

function scalePath(points: readonly Point[]): Array<{ x: number; y: number }> {
  const output: Array<{ x: number; y: number }> = [];

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const next = {
      x: scaledCoordinate(point.x),
      y: scaledCoordinate(point.y),
    };
    const previous = output.at(-1);
    if (!previous || !sameIntegerPoint(previous, next)) output.push(next);
  }

  if (
    output.length > 1 &&
    output[0] &&
    output.at(-1) &&
    sameIntegerPoint(output[0], output.at(-1)!)
  ) {
    output.pop();
  }

  return output;
}

function scalePolygons(
  polygons: readonly (readonly Point[])[],
): Array<Array<{ x: number; y: number }>> {
  return polygons.map(scalePath).filter((path) => path.length >= 3);
}

function unscalePath(
  path: readonly { x: number; y: number }[],
): Point[] {
  return path.map((point) => ({
    x: point.x / CLIPPER_COORDINATE_SCALE,
    y: point.y / CLIPPER_COORDINATE_SCALE,
  }));
}

function regionsFromPolyTree(tree: clipperLib.PolyTree): PolygonRegion[] {
  const regions: PolygonRegion[] = [];

  const visitOuter = (node: clipperLib.PolyNode): void => {
    if (node.isHole) {
      node.childs.forEach(visitOuter);
      return;
    }

    const outer = unscalePath(node.contour);
    if (outer.length >= 3) {
      const holes = node.childs
        .filter((child) => child.isHole && child.contour.length >= 3)
        .map((child) => unscalePath(child.contour));
      regions.push({ outer, holes });
    }

    for (const child of node.childs) {
      if (child.isHole) {
        child.childs.forEach(visitOuter);
      } else {
        visitOuter(child);
      }
    }
  };

  tree.childs.forEach(visitOuter);
  return regions;
}

function clipType(operation: PolygonBooleanOperation): clipperLib.ClipType {
  if (operation === 'union') return clipperLib.ClipType.Union;
  if (operation === 'difference') return clipperLib.ClipType.Difference;
  if (operation === 'intersection') return clipperLib.ClipType.Intersection;
  return clipperLib.ClipType.Xor;
}

function joinType(join: PolygonJoinStyle): clipperLib.JoinType {
  if (join === 'round') return clipperLib.JoinType.Round;
  if (join === 'square') return clipperLib.JoinType.Square;
  return clipperLib.JoinType.Miter;
}

function unionOnly(
  clipper: clipperLib.ClipperLibWrapper,
  paths: Array<Array<{ x: number; y: number }>>,
): PolygonRegion[] {
  if (paths.length === 0) return [];
  return regionsFromPolyTree(
    clipper.clipToPolyTree({
      clipType: clipperLib.ClipType.Union,
      subjectInputs: [{ data: paths, closed: true }],
      subjectFillType: clipperLib.PolyFillType.EvenOdd,
    }),
  );
}

export async function clipperPolygonBoolean(
  subjects: readonly (readonly Point[])[],
  clips: readonly (readonly Point[])[],
  operation: PolygonBooleanOperation,
): Promise<PolygonRegion[]> {
  const clipper = await loadClipper();
  const subjectPaths = scalePolygons(subjects);
  const clipPaths = scalePolygons(clips);

  if (operation === 'union') {
    return unionOnly(clipper, [...subjectPaths, ...clipPaths]);
  }
  if (subjectPaths.length === 0) return [];
  if (clipPaths.length === 0) {
    return operation === 'intersection'
      ? []
      : unionOnly(clipper, subjectPaths);
  }

  const tree = clipper.clipToPolyTree({
    clipType: clipType(operation),
    subjectInputs: [{ data: subjectPaths, closed: true }],
    clipInputs: [{ data: clipPaths }],
    subjectFillType: clipperLib.PolyFillType.EvenOdd,
    clipFillType: clipperLib.PolyFillType.EvenOdd,
  });
  return regionsFromPolyTree(tree);
}

export async function clipperPolygonOffset(
  polygons: readonly (readonly Point[])[],
  delta: number,
  options: PolygonOffsetOptions = {},
): Promise<PolygonRegion[]> {
  if (!Number.isFinite(delta)) {
    throw new TypeError('Polygon offset delta must be finite.');
  }

  const clipper = await loadClipper();
  const sourcePaths = scalePolygons(polygons);
  if (sourcePaths.length === 0) return [];

  // Clipper expects closed outer paths to use a consistent orientation.
  const referenceOrientation = clipper.orientation(sourcePaths[0]!);
  const paths = sourcePaths.map((path) =>
    clipper.orientation(path) === referenceOrientation ? path : [...path].reverse(),
  );

  const tree = clipper.offsetToPolyTree({
    delta: scaledCoordinate(delta),
    miterLimit: options.miterLimit ?? 2,
    arcTolerance:
      (options.arcTolerance ?? 0.01) * CLIPPER_COORDINATE_SCALE,
    offsetInputs: [
      {
        data: paths,
        joinType: joinType(options.join ?? 'miter'),
        endType: clipperLib.EndType.ClosedPolygon,
      },
    ],
  });

  return tree ? regionsFromPolyTree(tree) : [];
}
