import { normalizeDegrees, round3 } from '../../core/numeric';
import {
  normalizeRoomFeature,
  type RoomFeature,
} from '../../domain/room-features';
import type { JsonObject } from '../../domain/types';
import {
  addRoomFeature,
  deleteRoomFeature,
} from '../commands/room-features';
import type { ReadonlyApplicationState } from '../state';
import type {
  ToolHandler,
  ToolHandlerContext,
  ToolPointerInput,
} from './types';
import type { RoomFeatureIdFactory } from './room-features';

export type LinkedWallBrushAction = 'add' | 'erase';
export type LinkedWallEdge = 'back' | 'left' | 'right';

export interface LinkedWallTarget {
  groupKey: string;
  groupId: string | null;
  anchorFeatureId: string;
  edge: LinkedWallEdge;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  occupiedWallId: string | null;
}

interface RunFrame {
  groupKey: string;
  groupId: string | null;
  anchorFeatureId: string;
  u: { x: number; y: number };
  v: { x: number; y: number };
  startEdge: number;
  endEdge: number;
  backLine: number;
  firstDepth: number;
  lastDepth: number;
}

function activeLayout(state: ReadonlyApplicationState) {
  if (state.session.workspace !== 'design') return null;
  return (
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null
  );
}

function center(feature: RoomFeature): { x: number; y: number } {
  return {
    x: feature.x + feature.length / 2,
    y: feature.y + feature.depth / 2,
  };
}

function rotationDelta(a: number, b: number): number {
  return Math.abs((((a - b + 540) % 360) + 360) % 360 - 180);
}

function attachment(feature: RoomFeature): Record<string, unknown> | null {
  const raw = feature.attachment;
  return raw && !Array.isArray(raw) && typeof raw === 'object'
    ? (raw as Record<string, unknown>)
    : null;
}

function linkedWallIdentity(
  feature: RoomFeature,
): { groupId: string | null; edge: LinkedWallEdge } | null {
  if (feature.kind !== 'wall') return null;
  const raw = attachment(feature);
  if (!raw || raw.kind !== 'roomFeatureWall' || raw.linked === false) return null;
  const edge = raw.edge;
  if (edge !== 'back' && edge !== 'left' && edge !== 'right') return null;
  const groupId = typeof raw.groupId === 'string' && raw.groupId.trim()
    ? raw.groupId
    : null;
  return { groupId, edge };
}

function frameForGroup(
  features: readonly RoomFeature[],
  anchor: RoomFeature,
): RunFrame | null {
  if (anchor.kind !== 'feature') return null;
  const groupId = anchor.groupId;
  const members = features.filter((feature) =>
    feature.kind === 'feature' &&
    (groupId ? feature.groupId === groupId : feature.id === anchor.id),
  );
  if (!members.length) return null;

  const angle = anchor.rotation;
  if (members.some((feature) => rotationDelta(feature.rotation, angle) >= 0.01)) {
    return null;
  }

  const radians = (angle * Math.PI) / 180;
  const u = { x: Math.cos(radians), y: Math.sin(radians) };
  const v = { x: -u.y, y: u.x };
  const ordered = [...members].sort((a, b) => {
    const ac = center(a);
    const bc = center(b);
    return ac.x * u.x + ac.y * u.y - (bc.x * u.x + bc.y * u.y);
  });
  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const firstCenter = center(first);
  const startEdge =
    firstCenter.x * u.x + firstCenter.y * u.y - first.length / 2;
  const backLine =
    firstCenter.x * v.x + firstCenter.y * v.y - first.depth / 2;
  const total = ordered.reduce(
    (sum, feature) => sum + Math.max(0.25, feature.length),
    0,
  );

  return {
    groupKey: groupId ?? `feature:${anchor.id}`,
    groupId,
    anchorFeatureId: anchor.id,
    u,
    v,
    startEdge,
    endEdge: startEdge + total,
    backLine,
    firstDepth: first.depth,
    lastDepth: last.depth,
  };
}

function framePoint(
  frame: RunFrame,
  along: number,
  across: number,
): { x: number; y: number } {
  return {
    x: frame.u.x * along + frame.v.x * across,
    y: frame.u.y * along + frame.v.y * across,
  };
}

function targetSegment(
  frame: RunFrame,
  edge: LinkedWallEdge,
  thickness: number,
  joinBack: boolean,
): { p1: { x: number; y: number }; p2: { x: number; y: number } } {
  const back = frame.backLine;
  if (edge === 'back') {
    return {
      p1: framePoint(frame, frame.startEdge, back),
      p2: framePoint(frame, frame.endEdge, back),
    };
  }

  const backStart = back - (joinBack ? thickness : 0);
  if (edge === 'left') {
    return {
      p1: framePoint(frame, frame.startEdge, backStart),
      p2: framePoint(frame, frame.startEdge, back + frame.firstDepth),
    };
  }

  return {
    p1: framePoint(frame, frame.endEdge, back + frame.lastDepth),
    p2: framePoint(frame, frame.endEdge, backStart),
  };
}

export function createLinkedWallTargets(
  state: ReadonlyApplicationState,
  thickness = 4.5,
): LinkedWallTarget[] {
  const layout = activeLayout(state);
  if (!layout) return [];
  const safeThickness = Math.max(0.25, Math.min(24, Number(thickness) || 4.5));
  const seen = new Set<string>();
  const linked = layout.roomFeatures
    .map((feature) => ({ feature, identity: linkedWallIdentity(feature) }))
    .filter((item) => item.identity !== null);
  const targets: LinkedWallTarget[] = [];

  layout.roomFeatures.forEach((feature) => {
    if (feature.kind !== 'feature' || !feature.visible) return;
    const groupKey = feature.groupId ?? `feature:${feature.id}`;
    if (seen.has(groupKey)) return;
    seen.add(groupKey);
    const frame = frameForGroup(layout.roomFeatures, feature);
    if (!frame) return;
    const hasBack = linked.some(({ identity }) =>
      identity?.edge === 'back' &&
      (frame.groupId ? identity.groupId === frame.groupId : false),
    );

    (['back', 'left', 'right'] as const).forEach((edge) => {
      const occupied = linked.find(({ feature: wall, identity }) => {
        if (!identity || identity.edge !== edge) return false;
        if (frame.groupId) return identity.groupId === frame.groupId;
        const raw = attachment(wall);
        return raw?.anchorFeatureId === frame.anchorFeatureId;
      });
      const segment = targetSegment(
        frame,
        edge,
        safeThickness,
        hasBack && edge !== 'back',
      );
      targets.push({
        groupKey: frame.groupKey,
        groupId: frame.groupId,
        anchorFeatureId: frame.anchorFeatureId,
        edge,
        p1: segment.p1,
        p2: segment.p2,
        occupiedWallId: occupied?.feature.id ?? null,
      });
    });
  });

  return targets;
}

function distanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.y - (start.y + dy * t),
  );
}

export function hitTestLinkedWallTarget(
  targets: readonly LinkedWallTarget[],
  point: { x: number; y: number },
  tolerance: number,
): LinkedWallTarget | null {
  let best: LinkedWallTarget | null = null;
  let bestDistance = Math.max(0, tolerance);
  targets.forEach((target) => {
    const distance = distanceToSegment(point, target.p1, target.p2);
    if (distance <= bestDistance) {
      best = target;
      bestDistance = distance;
    }
  });
  return best;
}

function brushAction(context: ToolHandlerContext): LinkedWallBrushAction {
  return context.tool.options.brush === 'erase' ? 'erase' : 'add';
}

function brushThickness(context: ToolHandlerContext): number {
  const raw = Number(context.tool.options.thickness);
  return round3(Math.max(0.25, Math.min(24, Number.isFinite(raw) ? raw : 4.5)));
}

function brushWallType(context: ToolHandlerContext): 'full' | 'knee' {
  return context.tool.options.wallType === 'knee' ? 'knee' : 'full';
}

function targetPreview(
  target: LinkedWallTarget | null,
  action: LinkedWallBrushAction,
): JsonObject | null {
  if (!target) return null;
  return {
    kind: 'linked-wall-target',
    groupKey: target.groupKey,
    anchorFeatureId: target.anchorFeatureId,
    edge: target.edge,
    p1: { ...target.p1 },
    p2: { ...target.p2 },
    occupied: target.occupiedWallId !== null,
    action,
  };
}

function wallFromTarget(
  target: LinkedWallTarget,
  id: string,
  thickness: number,
  wallType: 'full' | 'knee',
): RoomFeature {
  const dx = target.p2.x - target.p1.x;
  const dy = target.p2.y - target.p1.y;
  const length = Math.max(0.25, Math.hypot(dx, dy));
  const rotation = normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI);
  const midpoint = {
    x: (target.p1.x + target.p2.x) / 2,
    y: (target.p1.y + target.p2.y) / 2,
  };
  const radians = (rotation * Math.PI) / 180;
  const normal = { x: -Math.sin(radians), y: Math.cos(radians) };
  const side = target.edge === 'right' ? -1 : 1;
  const featureCenter = {
    x: midpoint.x - normal.x * thickness * side / 2,
    y: midpoint.y - normal.y * thickness * side / 2,
  };
  const edgeName =
    target.edge === 'back'
      ? 'Back Wall'
      : target.edge === 'left'
        ? 'Left Wall'
        : 'Right Wall';
  const name = wallType === 'knee' ? `Knee ${edgeName}` : edgeName;

  return normalizeRoomFeature({
    id,
    kind: 'wall',
    featureType: 'wall',
    name,
    x: round3(featureCenter.x - length / 2),
    y: round3(featureCenter.y - thickness / 2),
    length: round3(length),
    depth: thickness,
    rotation: round3(rotation),
    wallType,
    receivesCountertop: false,
    groupId: target.groupId,
    attachment: {
      kind: 'roomFeatureWall',
      groupId: target.groupId,
      anchorFeatureId: target.anchorFeatureId,
      edge: target.edge,
      linked: true,
    },
  });
}

export function createLinkedWallBrushHandler(
  createId: RoomFeatureIdFactory,
): ToolHandler {
  const targetFor = (
    context: ToolHandlerContext,
    input: ToolPointerInput,
  ): LinkedWallTarget | null => {
    const layout = activeLayout(context.state);
    if (!layout) return null;
    const tolerance = 10 / Math.max(0.001, Math.abs(layout.scale || 1));
    return hitTestLinkedWallTarget(
      createLinkedWallTargets(context.state, brushThickness(context)),
      input,
      tolerance,
    );
  };

  return {
    onActivate(context) {
      const options = context.tool.options;
      if (
        options.brush === 'erase' ||
        options.thickness !== undefined ||
        options.wallType !== undefined
      ) {
        return;
      }
      return { preview: null };
    },
    onPointerMove(context, input) {
      return {
        preview: targetPreview(
          targetFor(context, input),
          brushAction(context),
        ),
      };
    },
    onPointerDown(context, input) {
      if (input.button !== 0) return;
      const layout = activeLayout(context.state);
      if (!layout) return;
      const target = targetFor(context, input);
      if (!target) return { preview: null };
      const action = brushAction(context);
      const preview = targetPreview(target, action);

      if (action === 'erase') {
        if (!target.occupiedWallId) return { preview };
        return {
          preview,
          commands: [deleteRoomFeature(layout.id, target.occupiedWallId)],
          transactionLabel: 'Remove linked wall',
        };
      }

      if (target.occupiedWallId) return { preview };
      return {
        preview,
        commands: [
          addRoomFeature(
            layout.id,
            wallFromTarget(
              target,
              createId('room-wall'),
              brushThickness(context),
              brushWallType(context),
            ),
          ),
        ],
        transactionLabel: 'Add linked wall',
      };
    },
    onPointerUp() {
      return { preview: null };
    },
  };
}
