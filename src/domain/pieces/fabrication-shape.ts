import { round3 } from '../../core/numeric';
import { geometryKernel, type Point, type PolygonRegion } from '../../geometry';
import { normalizePieceCutout } from './cutouts';
import { pieceSinkLocalPose, sinkFaucetHoles } from './sinks';
import type {
  Piece,
  PieceFabricationPoint,
  PieceFabricationShape,
} from './types';

const SHAPE_EPSILON = 1e-6;
const CURVE_SEGMENTS = 32;
const CORNER_SEGMENTS = 6;

function samePoint(a: PieceFabricationPoint, b: PieceFabricationPoint): boolean {
  return Math.abs(a.x - b.x) <= SHAPE_EPSILON &&
    Math.abs(a.y - b.y) <= SHAPE_EPSILON;
}

function polygonSignedArea(points: readonly PieceFabricationPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

/**
 * Validate/clamp a custom local fabrication boundary to the Piece editing
 * frame. A null result means CAD Lite should fall back to the rectangle-era
 * frame geometry.
 */
export function createPieceFabricationShape(
  points: readonly PieceFabricationPoint[],
  width: number,
  height: number,
): PieceFabricationShape | null {
  const w = Math.max(0.25, Number.isFinite(width) ? width : 0.25);
  const h = Math.max(0.25, Number.isFinite(height) ? height : 0.25);
  const output: PieceFabricationPoint[] = [];

  for (const source of points) {
    if (!Number.isFinite(source.x) || !Number.isFinite(source.y)) continue;
    const point = {
      x: round3(Math.max(0, Math.min(w, source.x))),
      y: round3(Math.max(0, Math.min(h, source.y))),
    };
    const previous = output.at(-1);
    if (!previous || !samePoint(previous, point)) output.push(point);
  }

  if (
    output.length > 1 &&
    output[0] &&
    output.at(-1) &&
    samePoint(output[0], output.at(-1)!)
  ) {
    output.pop();
  }

  if (output.length < 3 || Math.abs(polygonSignedArea(output)) <= SHAPE_EPSILON) {
    return null;
  }

  return { kind: 'polygon', outer: output };
}

export function pieceHasCustomFabricationShape(piece: Piece): boolean {
  return Boolean(
    piece.fabricationShape?.kind === 'polygon' &&
      piece.fabricationShape.outer.length >= 3,
  );
}

/**
 * Return the local outer fabrication boundary. Rectangle-era Pieces derive a
 * four-point polygon on demand, so every caller can consume a polygon without
 * requiring a migration of existing projects.
 */
export function pieceFabricationOutline(piece: Piece): PieceFabricationPoint[] {
  const custom = piece.fabricationShape?.kind === 'polygon'
    ? createPieceFabricationShape(piece.fabricationShape.outer, piece.w, piece.h)
    : null;
  if (custom) return custom.outer.map((point) => ({ ...point }));

  return [
    { x: 0, y: 0 },
    { x: piece.w, y: 0 },
    { x: piece.w, y: piece.h },
    { x: 0, y: piece.h },
  ];
}

export function scalePieceFabricationShape(
  shape: PieceFabricationShape | null | undefined,
  oldWidth: number,
  oldHeight: number,
  nextWidth: number,
  nextHeight: number,
): PieceFabricationShape | null {
  if (!shape || shape.kind !== 'polygon') return null;
  const safeOldWidth = Math.max(0.25, oldWidth);
  const safeOldHeight = Math.max(0.25, oldHeight);
  const sx = nextWidth / safeOldWidth;
  const sy = nextHeight / safeOldHeight;
  return createPieceFabricationShape(
    shape.outer.map((point) => ({
      x: point.x * sx,
      y: point.y * sy,
    })),
    nextWidth,
    nextHeight,
  );
}

export function mirrorPieceFabricationShape(
  shape: PieceFabricationShape | null | undefined,
  width: number,
  height: number,
  axis: 'h' | 'v',
): PieceFabricationShape | null {
  if (!shape || shape.kind !== 'polygon') return null;
  const points = shape.outer.map((point) =>
    axis === 'h'
      ? { x: width - point.x, y: point.y }
      : { x: point.x, y: height - point.y });
  // Mirroring reverses winding. Reverse again so downstream topology gets a
  // stable outer-contour orientation independent of the transform history.
  points.reverse();
  return createPieceFabricationShape(points, width, height);
}

function rotateAround(
  point: Point,
  center: Point,
  degrees: number,
): Point {
  if (!degrees) return point;
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function ellipseOutline(
  cx: number,
  cy: number,
  width: number,
  height: number,
  rotation = 0,
  segments = CURVE_SEGMENTS,
): Point[] {
  const output: Point[] = [];
  const count = Math.max(12, segments);
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2;
    const point = {
      x: cx + Math.cos(angle) * width / 2,
      y: cy + Math.sin(angle) * height / 2,
    };
    output.push(rotateAround(point, { x: cx, y: cy }, rotation));
  }
  return output;
}

function roundedRectOutline(
  cx: number,
  cy: number,
  width: number,
  height: number,
  radius: number,
  rotation = 0,
): Point[] {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r <= SHAPE_EPSILON) {
    return [
      { x: cx - w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy + h / 2 },
      { x: cx - w / 2, y: cy + h / 2 },
    ].map((point) => rotateAround(point, { x: cx, y: cy }, rotation));
  }

  const corners = [
    { x: cx + w / 2 - r, y: cy - h / 2 + r, start: -90 },
    { x: cx + w / 2 - r, y: cy + h / 2 - r, start: 0 },
    { x: cx - w / 2 + r, y: cy + h / 2 - r, start: 90 },
    { x: cx - w / 2 + r, y: cy - h / 2 + r, start: 180 },
  ];
  const output: Point[] = [];

  corners.forEach((corner) => {
    for (let step = 0; step <= CORNER_SEGMENTS; step += 1) {
      const angle = (corner.start + step / CORNER_SEGMENTS * 90) * Math.PI / 180;
      const point = {
        x: corner.x + Math.cos(angle) * r,
        y: corner.y + Math.sin(angle) * r,
      };
      output.push(rotateAround(point, { x: cx, y: cy }, rotation));
    }
  });

  return output;
}

/**
 * Produce Piece-local closed contours for every semantic fabrication opening.
 * Faucet bores are included because they are real stone removals as well.
 */
export function pieceFabricationHoleOutlines(piece: Piece): Point[][] {
  const holes: Point[][] = [];

  piece.sinks.forEach((sink) => {
    const pose = pieceSinkLocalPose(piece, sink);
    holes.push(
      sink.shape === 'oval'
        ? ellipseOutline(pose.cx, pose.cy, sink.w, sink.h, pose.angle)
        : roundedRectOutline(
            pose.cx,
            pose.cy,
            sink.w,
            sink.h,
            sink.cornerR,
            pose.angle,
          ),
    );

    sinkFaucetHoles(sink).forEach((hole) => {
      const center = rotateAround(
        { x: pose.cx + hole.x, y: pose.cy + hole.y },
        { x: pose.cx, y: pose.cy },
        pose.angle,
      );
      holes.push(
        ellipseOutline(
          center.x,
          center.y,
          hole.radius * 2,
          hole.radius * 2,
        ),
      );
    });
  });

  piece.cutouts.forEach((source) => {
    const cutout = normalizePieceCutout(source, piece);
    if (cutout.kind === 'circle') {
      const diameter = cutout.diameter ?? cutout.w;
      holes.push(ellipseOutline(cutout.cx, cutout.cy, diameter, diameter));
      return;
    }
    if (cutout.kind === 'oval') {
      holes.push(
        ellipseOutline(
          cutout.cx,
          cutout.cy,
          cutout.w,
          cutout.h,
          cutout.rotation,
        ),
      );
      return;
    }
    holes.push(
      roundedRectOutline(
        cutout.cx,
        cutout.cy,
        cutout.w,
        cutout.h,
        cutout.cornerR,
        cutout.rotation,
      ),
    );
  });

  return holes;
}

/**
 * Resolve the actual fabrication topology for a Piece. The outer boundary is
 * polygonal even for legacy rectangles; sinks, faucet bores, and cutouts are
 * subtracted by Clipper and returned as explicit region holes.
 */
export async function pieceFabricationRegions(
  piece: Piece,
): Promise<PolygonRegion[]> {
  const outer = pieceFabricationOutline(piece);
  const holes = pieceFabricationHoleOutlines(piece);
  if (holes.length === 0) {
    return [{ outer: outer.map((point) => ({ ...point })), holes: [] }];
  }
  return geometryKernel.polygonBoolean([outer], holes, 'difference');
}
