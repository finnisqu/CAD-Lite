import { updatePieceEdgeProperties } from '../commands/piece-edge-properties';
import {
  isBacksplashPiece,
  pieceGeometry,
  piecePose,
  pieceRotatedCornersFromGeometryPose,
  type Piece,
  type PieceSide,
} from '../../domain/pieces';
import type { Point } from '../../geometry';
import type { ReadonlyApplicationState } from '../state';
import type {
  ActiveToolSession,
  ToolHandler,
  ToolPointerInput,
} from './types';

export type EdgePainterBrushAction = 'paint' | 'erase';

export interface EdgePainterProfileOption {
  value: string;
  label: string;
}

export const EDGE_PAINTER_PROFILE_KEY = 'litecad:edgePainterProfile';
export const DEFAULT_EDGE_PAINTER_PROFILE = 'quarter';
export const EDGE_PAINTER_PROFILES: readonly EdgePainterProfileOption[] = [
  { value: 'flat', label: 'Flat' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'bevel', label: 'Bevel' },
  { value: 'half-bull', label: 'Half bull' },
  { value: 'full-bull', label: 'Full bull' },
  { value: 'ogee', label: 'Ogee' },
  { value: 'miter', label: 'Miter' },
  { value: 'seam', label: 'Seam' },
];

export interface EdgePainterToolOptions {
  brush: EdgePainterBrushAction;
  profile: string;
}

export interface EdgePainterTarget {
  pieceId: string;
  side: PieceSide;
  start: Point;
  end: Point;
  currentProfile: string;
  profiled: boolean;
  hitStrokePx: number;
}

const SIDES: readonly PieceSide[] = ['top', 'right', 'bottom', 'left'];

function activeLayout(state: ReadonlyApplicationState) {
  if (state.session.workspace !== 'design') return null;
  return (
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null
  );
}

export function normalizeEdgePainterProfile(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  return EDGE_PAINTER_PROFILES.some((option) => option.value === raw)
    ? raw
    : DEFAULT_EDGE_PAINTER_PROFILE;
}

export function edgePainterToolOptions(
  tool: ActiveToolSession,
): EdgePainterToolOptions {
  return {
    brush: tool.options.brush === 'erase' ? 'erase' : 'paint',
    profile: normalizeEdgePainterProfile(tool.options.profile),
  };
}

function eligiblePieces(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
): Piece[] {
  const layout = activeLayout(state);
  if (!layout) return [];
  const pieces = layout.pieces.filter((piece) => !isBacksplashPiece(piece));
  if (tool.scope !== 'selected') return pieces;

  const selection = state.session.selection;
  if (selection.kind !== 'pieces' || selection.ids.length !== 1) return [];
  return pieces.filter((piece) => piece.id === selection.ids[0]);
}

function pieceTargets(piece: Piece, tool: ActiveToolSession): EdgePainterTarget[] {
  const corners = pieceRotatedCornersFromGeometryPose(
    pieceGeometry(piece),
    piecePose(piece, 'design'),
  );
  const [tl, tr, br, bl] = corners;
  if (!tl || !tr || !br || !bl) return [];

  const points: Record<PieceSide, readonly [Point, Point]> = {
    top: [tl, tr],
    right: [tr, br],
    bottom: [br, bl],
    left: [bl, tl],
  };
  const options = edgePainterToolOptions(tool);

  return SIDES.flatMap((side) => {
    const currentProfile = piece.edgeProfiles[side] || 'flat';
    const profiled = currentProfile !== 'flat';
    if (options.brush === 'erase' && !profiled) return [];
    const [start, end] = points[side];
    return [{
      pieceId: piece.id,
      side,
      start,
      end,
      currentProfile,
      profiled,
      hitStrokePx: 18,
    }];
  });
}

export function createEdgePainterTargets(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
): EdgePainterTarget[] {
  if (tool.id !== 'edgePainter') return [];
  return eligiblePieces(state, tool).flatMap((piece) => pieceTargets(piece, tool));
}

function segmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length2 = dx * dx + dy * dy;
  if (length2 <= 1e-12) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / length2,
    ),
  );
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.y - (start.y + dy * t),
  );
}

export function hitTestEdgePainterTarget(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
  point: Point,
): EdgePainterTarget | null {
  const layout = activeLayout(state);
  const scale = Math.max(0.001, Math.abs(layout?.scale || 1));
  let best: EdgePainterTarget | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  createEdgePainterTargets(state, tool).forEach((target) => {
    const tolerance = target.hitStrokePx / 2 / scale;
    const distance = segmentDistance(point, target.start, target.end);
    if (distance <= tolerance && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  });
  return best;
}

function pointInsidePiece(piece: Piece, point: Point): boolean {
  const corners = pieceRotatedCornersFromGeometryPose(
    pieceGeometry(piece),
    piecePose(piece, 'design'),
  );
  if (corners.length !== 4) return false;

  let sign = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % corners.length];
    if (!a || !b) return false;
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (Math.abs(cross) <= 0.001) continue;
    const nextSign = cross > 0 ? 1 : -1;
    if (sign && nextSign !== sign) return false;
    sign = nextSign;
  }
  return true;
}

export function edgePainterPointHitsEligiblePiece(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
  point: Point,
): boolean {
  return eligiblePieces(state, tool).some((piece) => pointInsidePiece(piece, point));
}

const edgePainterHandler: ToolHandler = {
  onPointerDown(context, input: ToolPointerInput) {
    if (input.button !== 0) return;
    const layout = activeLayout(context.state);
    if (!layout) return { cancel: true };

    const point = { x: input.x, y: input.y };
    const target = hitTestEdgePainterTarget(context.state, context.tool, point);
    if (!target) {
      return edgePainterPointHitsEligiblePiece(context.state, context.tool, point)
        ? undefined
        : { cancel: true };
    }

    const options = edgePainterToolOptions(context.tool);
    const profile = options.brush === 'erase' ? 'flat' : options.profile;
    if (target.currentProfile === profile) return;

    return {
      commands: [
        updatePieceEdgeProperties(layout.id, target.pieceId, {
          edgeProfiles: { [target.side]: profile },
        }),
      ],
      transactionLabel:
        options.brush === 'erase' ? 'Erase edge profile' : 'Paint edge profile',
    };
  },
};

export function registerEdgePainterToolHandler(
  register: (tool: 'edgePainter', handler: ToolHandler) => () => void,
): () => void {
  return register('edgePainter', edgePainterHandler);
}
