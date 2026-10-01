import {
  addLinkedSplash,
  removeLinkedSplash,
} from '../commands/piece-splashes';
import {
  DEFAULT_SPLASH_HEIGHT,
  DEFAULT_SPLASH_OFFSET,
  isBacksplashPiece,
  linkedSplashForEdge,
  normalizeSplashHeight,
  normalizeSplashOffset,
  pieceCenterFromGeometryPose,
  pieceGeometry,
  piecePose,
  pieceRotatedCornersFromGeometryPose,
  type Piece,
  type PieceSide,
} from '../../domain/pieces';
import { pointSegmentDistance, rotateVector, type Point } from '../../geometry';
import type { ReadonlyApplicationState } from '../state';
import type {
  ActiveToolSession,
  ToolHandler,
  ToolPointerInput,
} from './types';

export type SplashToolIdFactory = (prefix: string) => string;
export type SplashBrushAction = 'add' | 'erase';

export interface SplashToolOptions {
  brush: SplashBrushAction;
  height: number;
  offset: number;
}

export interface SplashEdgeTarget {
  pieceId: string;
  edge: PieceSide;
  occupied: boolean;
  start: Point;
  end: Point;
}

const EDGE_SEGMENTS: Readonly<Record<PieceSide, readonly [number, number]>> = {
  top: [0, 1],
  right: [1, 2],
  bottom: [2, 3],
  left: [3, 0],
};

function activeLayout(state: ReadonlyApplicationState) {
  if (state.session.workspace !== 'design') return null;
  return (
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null
  );
}

export function splashToolOptions(tool: ActiveToolSession): SplashToolOptions {
  return {
    brush: tool.options.brush === 'erase' ? 'erase' : 'add',
    height: normalizeSplashHeight(
      tool.options.height,
      DEFAULT_SPLASH_HEIGHT,
    ),
    offset: normalizeSplashOffset(
      tool.options.offset,
      DEFAULT_SPLASH_OFFSET,
    ),
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
  const id = selection.ids[0];
  return parents.filter((piece) => piece.id === id);
}

export function createSplashEdgeTargets(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
): SplashEdgeTarget[] {
  const layout = activeLayout(state);
  if (!layout || tool.id !== 'splash') return [];

  return eligibleParents(state, tool).flatMap((piece) => {
    const corners = pieceRotatedCornersFromGeometryPose(
      pieceGeometry(piece),
      piecePose(piece, 'design'),
    );
    return (Object.keys(EDGE_SEGMENTS) as PieceSide[]).flatMap((edge) => {
      const [startIndex, endIndex] = EDGE_SEGMENTS[edge];
      const start = corners[startIndex];
      const end = corners[endIndex];
      if (!start || !end) return [];
      return [{
        pieceId: piece.id,
        edge,
        occupied: linkedSplashForEdge(layout.pieces, piece.id, edge) !== null,
        start,
        end,
      }];
    });
  });
}

function hitTolerance(state: ReadonlyApplicationState): number {
  const layout = activeLayout(state);
  const scale = Math.max(0.001, Math.abs(layout?.scale || 1));
  const hitPixels = Math.max(11, Math.min(18, scale * 1.15));
  return hitPixels / scale;
}

export function hitTestSplashEdge(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
  point: Point,
): SplashEdgeTarget | null {
  const options = splashToolOptions(tool);
  const tolerance = hitTolerance(state);
  let best: SplashEdgeTarget | null = null;
  let bestDistance = tolerance;

  createSplashEdgeTargets(state, tool).forEach((target) => {
    if (options.brush === 'erase' && !target.occupied) return;
    const distance = pointSegmentDistance(point, target.start, target.end);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = target;
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

export function splashPointHitsEligibleParent(
  state: ReadonlyApplicationState,
  tool: ActiveToolSession,
  point: Point,
): boolean {
  return eligibleParents(state, tool).some((piece) => pointInsidePiece(piece, point));
}

function splashHandler(createId: SplashToolIdFactory): ToolHandler {
  return {
    onPointerDown(context, input: ToolPointerInput) {
      if (input.button !== 0) return;
      const layout = activeLayout(context.state);
      if (!layout) return { cancel: true };

      const point = { x: input.x, y: input.y };
      const target = hitTestSplashEdge(context.state, context.tool, point);
      if (!target) {
        return splashPointHitsEligibleParent(context.state, context.tool, point)
          ? undefined
          : { cancel: true };
      }

      const options = splashToolOptions(context.tool);
      if (options.brush === 'erase') {
        if (!target.occupied) return;
        return {
          commands: [
            removeLinkedSplash(layout.id, target.pieceId, target.edge),
          ],
          transactionLabel: 'Remove splash',
        };
      }

      if (target.occupied) return;
      return {
        commands: [
          addLinkedSplash(
            layout.id,
            target.pieceId,
            createId('splash'),
            target.edge,
            { height: options.height, offset: options.offset },
          ),
        ],
        transactionLabel: 'Add splash',
      };
    },
  };
}

export function registerSplashToolHandler(
  register: (tool: 'splash', handler: ToolHandler) => () => void,
  createId: SplashToolIdFactory,
): () => void {
  return register('splash', splashHandler(createId));
}
