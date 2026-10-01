import {
  addRadiusAnnotation,
  removeRadiusAnnotation,
  type RadiusReferenceSeed,
} from '../commands/radius-annotations';
import {
  findRadiusNote,
  type RadiusCorner,
  type RadiusLabelPlacement,
  type RadiusReference,
} from '../../domain/annotations/radius';
import {
  isBacksplashPiece,
  pieceCenterFromGeometryPose,
  pieceGeometry,
  piecePose,
  pieceSinkLocalPose,
  sinkReferenceAngle,
  type Piece,
  type PieceSink,
} from '../../domain/pieces';
import { rotateVector, type Point } from '../../geometry';
import type { ReadonlyApplicationState } from '../state';
import type {
  ActiveToolSession,
  ToolHandler,
  ToolPointerInput,
} from './types';

export type RadiusToolIdFactory = (prefix: string) => string;
export type RadiusBrushAction = 'add' | 'erase';

export interface RadiusToolOptions {
  brush: RadiusBrushAction;
  placement: RadiusLabelPlacement;
}

export interface RadiusArc {
  start: Point;
  control: Point;
  end: Point;
}

export interface RadiusCornerTarget {
  reference: RadiusReferenceSeed;
  occupied: boolean;
  radius: number;
  arc: RadiusArc;
  hitStrokePx: number;
}

const CORNERS: readonly RadiusCorner[] = ['tl', 'tr', 'br', 'bl'];

function activeLayout(state: ReadonlyApplicationState) {
  if (state.session.workspace !== 'design') return null;
  return (
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null
  );
}

export function radiusToolOptions(tool: ActiveToolSession): RadiusToolOptions {
  return {
    brush: tool.options.brush === 'erase' ? 'erase' : 'add',
    placement: tool.options.placement === 'inside' ? 'inside' : 'outside',
  };
}

function eligibleParents(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
): Piece[] {
  const layout = activeLayout(state);
  if (!layout) return [];
  const parents = layout.pieces.filter((piece) => !isBacksplashPiece(piece));
  if (tool.scope !== 'selected') return parents;

  const selection = state.session.selection;
  if (selection.kind !== 'pieces' || selection.ids.length !== 1) return [];
  return parents.filter((piece) => piece.id === selection.ids[0]);
}

function signs(corner: RadiusCorner): { sx: -1 | 1; sy: -1 | 1 } {
  return {
    sx: corner === 'tl' || corner === 'bl' ? -1 : 1,
    sy: corner === 'tl' || corner === 'tr' ? -1 : 1,
  };
}

function worldPoint(
  center: Point,
  local: Point,
  rotation: number,
): Point {
  const rotated = rotateVector(local.x, local.y, rotation);
  return { x: center.x + rotated.x, y: center.y + rotated.y };
}

function rectangularCornerArc(
  center: Point,
  width: number,
  height: number,
  radius: number,
  corner: RadiusCorner,
  rotation: number,
): RadiusArc {
  const { sx, sy } = signs(corner);
  const vertex = { x: sx * width / 2, y: sy * height / 2 };
  const alongX = { x: vertex.x - sx * radius, y: vertex.y };
  const alongY = { x: vertex.x, y: vertex.y - sy * radius };
  return {
    start: worldPoint(center, alongY, rotation),
    control: worldPoint(center, vertex, rotation),
    end: worldPoint(center, alongX, rotation),
  };
}

function referenceForLookup(seed: RadiusReferenceSeed): RadiusReference {
  const common = {
    pieceId: seed.pieceId,
    corner: seed.corner,
    autoText: true,
    lastTarget: null,
  };
  return seed.kind === 'sink'
    ? { kind: 'sink', sinkId: seed.sinkId, ...common }
    : { kind: 'piece', ...common };
}

function pieceTargets(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
  piece: Piece,
): RadiusCornerTarget[] {
  const layout = activeLayout(state);
  if (!layout) return [];
  const geometry = pieceGeometry(piece);
  const pose = piecePose(piece, 'design');
  const center = pieceCenterFromGeometryPose(geometry, pose);

  return CORNERS.flatMap((corner) => {
    const radius = Math.max(0, Number(piece.cornerRadii[corner]) || 0);
    if (radius <= 0) return [];
    const reference: RadiusReferenceSeed = {
      kind: 'piece',
      pieceId: piece.id,
      corner,
    };
    const occupied = findRadiusNote(layout, referenceForLookup(reference)) !== null;
    if (radiusToolOptions(tool).brush === 'erase' && !occupied) return [];
    return [{
      reference,
      occupied,
      radius,
      arc: rectangularCornerArc(
        center,
        geometry.width,
        geometry.height,
        radius,
        corner,
        pose.rotation,
      ),
      hitStrokePx: radius < 2 ? 30 : 18,
    }];
  });
}

function sinkCenterAndAngle(
  piece: Piece,
  sink: PieceSink,
): { center: Point; angle: number } {
  const geometry = pieceGeometry(piece);
  const pose = piecePose(piece, 'design');
  const pieceCenter = pieceCenterFromGeometryPose(geometry, pose);
  const sinkPose = pieceSinkLocalPose(piece, sink);
  const local = {
    x: sinkPose.cx - geometry.width / 2,
    y: sinkPose.cy - geometry.height / 2,
  };
  const offset = rotateVector(local.x, local.y, pose.rotation);
  return {
    center: { x: pieceCenter.x + offset.x, y: pieceCenter.y + offset.y },
    angle: pose.rotation + sinkReferenceAngle(sink.side) + sink.rotation,
  };
}

function sinkTargets(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
  piece: Piece,
): RadiusCornerTarget[] {
  const layout = activeLayout(state);
  if (!layout) return [];

  return piece.sinks.flatMap((sink) => {
    if (sink.shape === 'oval') return [];
    const radius = Math.max(
      0,
      Math.min(Number(sink.cornerR) || 0, sink.w / 2, sink.h / 2),
    );
    if (radius <= 0) return [];
    const pose = sinkCenterAndAngle(piece, sink);

    return CORNERS.flatMap((corner) => {
      const reference: RadiusReferenceSeed = {
        kind: 'sink',
        pieceId: piece.id,
        sinkId: sink.id,
        corner,
      };
      const occupied = findRadiusNote(layout, referenceForLookup(reference)) !== null;
      if (radiusToolOptions(tool).brush === 'erase' && !occupied) return [];
      return [{
        reference,
        occupied,
        radius,
        arc: rectangularCornerArc(
          pose.center,
          sink.w,
          sink.h,
          radius,
          corner,
          pose.angle,
        ),
        hitStrokePx: radius < 2 ? 28 : 16,
      }];
    });
  });
}

export function createRadiusCornerTargets(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
): RadiusCornerTarget[] {
  if (tool.id !== 'radius') return [];
  return eligibleParents(state, tool).flatMap((piece) => [
    ...pieceTargets(state, tool, piece),
    ...sinkTargets(state, tool, piece),
  ]);
}

function quadraticPoint(arc: RadiusArc, t: number): Point {
  const u = 1 - t;
  return {
    x:
      u * u * arc.start.x +
      2 * u * t * arc.control.x +
      t * t * arc.end.x,
    y:
      u * u * arc.start.y +
      2 * u * t * arc.control.y +
      t * t * arc.end.y,
  };
}

function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 <= 1e-12) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2),
  );
  return Math.hypot(
    point.x - (a.x + dx * t),
    point.y - (a.y + dy * t),
  );
}

function distanceToArc(point: Point, arc: RadiusArc): number {
  let previous = arc.start;
  let best = Number.POSITIVE_INFINITY;
  for (let step = 1; step <= 16; step += 1) {
    const current = quadraticPoint(arc, step / 16);
    best = Math.min(best, segmentDistance(point, previous, current));
    previous = current;
  }
  return best;
}

export function hitTestRadiusTarget(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
  point: Point,
): RadiusCornerTarget | null {
  const layout = activeLayout(state);
  const scale = Math.max(0.001, Math.abs(layout?.scale || 1));
  let best: RadiusCornerTarget | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  createRadiusCornerTargets(state, tool).forEach((target) => {
    const tolerance = target.hitStrokePx / 2 / scale;
    const distance = distanceToArc(point, target.arc);
    if (distance <= tolerance && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  });
  return best;
}

function pointInsidePiece(piece: Piece, point: Point): boolean {
  const geometry = pieceGeometry(piece);
  const pose = piecePose(piece, 'design');
  const center = pieceCenterFromGeometryPose(geometry, pose);
  const u = rotateVector(1, 0, pose.rotation);
  const v = rotateVector(0, 1, pose.rotation);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const localX = dx * u.x + dy * u.y;
  const localY = dx * v.x + dy * v.y;
  return (
    Math.abs(localX) <= geometry.width / 2 + 0.001 &&
    Math.abs(localY) <= geometry.height / 2 + 0.001
  );
}

export function radiusPointHitsEligibleParent(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
  point: Point,
): boolean {
  return eligibleParents(state, tool).some((piece) => pointInsidePiece(piece, point));
}

function radiusHandler(createId: RadiusToolIdFactory): ToolHandler {
  return {
    onPointerDown(context, input: ToolPointerInput) {
      if (input.button !== 0) return;
      const layout = activeLayout(context.state);
      if (!layout) return { cancel: true };

      const point = { x: input.x, y: input.y };
      const target = hitTestRadiusTarget(context.state, context.tool, point);
      if (!target) {
        return radiusPointHitsEligibleParent(context.state, context.tool, point)
          ? undefined
          : { cancel: true };
      }

      const options = radiusToolOptions(context.tool);
      if (options.brush === 'erase') {
        return {
          commands: [removeRadiusAnnotation(layout.id, target.reference)],
          transactionLabel: 'Remove radius label',
        };
      }

      if (target.occupied) return;
      return {
        commands: [
          addRadiusAnnotation(
            layout.id,
            target.reference,
            {
              noteId: createId('radius-note'),
              lineId: createId('radius-line'),
            },
            options.placement,
          ),
        ],
        transactionLabel: 'Add radius label',
      };
    },
  };
}

export function registerRadiusToolHandler(
  register: (tool: 'radius', handler: ToolHandler) => () => void,
  createId: RadiusToolIdFactory,
): () => void {
  return register('radius', radiusHandler(createId));
}
