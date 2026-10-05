import { normalizeDegrees, round3 } from '../../core/numeric';
import {
  createRoomFeature,
  type RoomFeature,
} from '../../domain/room-features';
import type { Layout } from '../../domain/project';
import type { JsonObject } from '../../domain/types';
import { addRoomFeature } from '../commands/room-features';
import type { ReadonlyApplicationState } from '../state';
import { createLinkedWallBrushHandler } from './linked-wall-brush';
import {
  resolveRoomFeaturePointer,
  type RoomFeatureIdFactory,
} from './room-features';
import type {
  ToolHandler,
  ToolHandlerContext,
  ToolId,
  ToolPointerInput,
} from './types';

function activeLayout(state: ReadonlyApplicationState): Layout | null {
  if (state.session.workspace !== 'design') return null;
  return (
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null
  );
}

function wallThickness(context: ToolHandlerContext): number {
  const raw = Number(context.tool.options.thickness);
  const value = Number.isFinite(raw) ? raw : 4.5;
  return round3(Math.max(0.25, Math.min(24, value)));
}

function roomWallType(context: ToolHandlerContext): 'full' | 'knee' {
  return context.tool.options.wallType === 'knee' ? 'knee' : 'full';
}

function weakStraightPoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  shift: boolean,
): { x: number; y: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (shift) {
    return Math.abs(dx) >= Math.abs(dy)
      ? { x: end.x, y: start.y }
      : { x: start.x, y: end.y };
  }

  const angle = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  const horizontal = Math.min(angle, Math.abs(180 - angle));
  const vertical = Math.abs(90 - angle);
  if (horizontal <= 3) return { x: end.x, y: start.y };
  if (vertical <= 3) return { x: start.x, y: end.y };
  return end;
}

function currentWallPreview(
  state: ReadonlyApplicationState,
): Record<string, unknown> | null {
  const raw = state.session.interaction.preview;
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  return record.kind === 'room-feature-create' && record.tool === 'roomWall'
    ? record
    : null;
}

function startWallPreview(
  context: ToolHandlerContext,
  input: ToolPointerInput,
): JsonObject | null {
  if (!activeLayout(context.state)) return null;
  const snap = resolveRoomFeaturePointer(context.state, input);
  const depth = wallThickness(context);

  return {
    kind: 'room-feature-create',
    tool: 'roomWall',
    startX: snap.point.x,
    startY: snap.point.y,
    endX: snap.point.x,
    endY: snap.point.y,
    x: snap.point.x,
    y: snap.point.y - depth / 2,
    length: 0.25,
    rawLength: 0,
    depth,
    rotation: 0,
    featureType: 'wall',
    wallType: roomWallType(context),
    guideX: snap.guideX,
    guideY: snap.guideY,
    snapX: snap.snapped ? snap.point.x : null,
    snapY: snap.snapped ? snap.point.y : null,
  };
}

function updateWallPreview(
  context: ToolHandlerContext,
  input: ToolPointerInput,
): JsonObject | null {
  const current = currentWallPreview(context.state);
  if (!current || !activeLayout(context.state)) return null;
  const snap = resolveRoomFeaturePointer(context.state, input);
  const start = {
    x: Number(current.startX) || 0,
    y: Number(current.startY) || 0,
  };
  const end = weakStraightPoint(start, snap.point, input.modifiers.shift);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const rawLength = Math.hypot(dx, dy);
  const length = Math.max(0.25, rawLength);
  const rotation = normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI);
  const center = {
    x: start.x + dx / 2,
    y: start.y + dy / 2,
  };
  const depth = wallThickness(context);

  return {
    ...current,
    endX: round3(end.x),
    endY: round3(end.y),
    x: round3(center.x - length / 2),
    y: round3(center.y - depth / 2),
    length: round3(length),
    rawLength: round3(rawLength),
    depth,
    wallType: roomWallType(context),
    rotation: round3(rotation),
    guideX: snap.guideX,
    guideY: snap.guideY,
    snapX: snap.snapped ? end.x : null,
    snapY: snap.snapped ? end.y : null,
  };
}

function featureFromWallPreview(
  preview: Record<string, unknown>,
  id: string,
): RoomFeature {
  const wallType = preview.wallType === 'knee' ? 'knee' : 'full';
  const name = wallType === 'knee' ? 'Knee Wall' : 'Wall';

  return createRoomFeature(id, 'wall', {
    kind: 'wall',
    name,
    x: Number(preview.x) || 0,
    y: Number(preview.y) || 0,
    length: Math.max(0.25, Number(preview.length) || 0.25),
    depth: Math.max(0.25, Number(preview.depth) || 4.5),
    rotation: Number(preview.rotation) || 0,
    wallType,
    receivesCountertop: false,
  });
}

function chainedWallPreview(
  context: ToolHandlerContext,
  preview: Record<string, unknown>,
): JsonObject {
  const x = Number(preview.endX) || 0;
  const y = Number(preview.endY) || 0;
  const depth = wallThickness(context);
  return {
    kind: 'room-feature-create',
    tool: 'roomWall',
    startX: x,
    startY: y,
    endX: x,
    endY: y,
    x,
    y: y - depth / 2,
    length: 0.25,
    rawLength: 0,
    depth,
    rotation: 0,
    featureType: 'wall',
    wallType: roomWallType(context),
    guideX: null,
    guideY: null,
    snapX: null,
    snapY: null,
  };
}

function roomWallHandler(createId: RoomFeatureIdFactory): ToolHandler {
  return {
    onPointerDown(context, input) {
      const layout = activeLayout(context.state);
      if (input.button !== 0 || !layout) return;

      const current = currentWallPreview(context.state);
      if (!current) {
        const preview = startWallPreview(context, input);
        return preview ? { preview } : undefined;
      }

      const preview = updateWallPreview(context, input);
      if (!preview) return;

      // v1.5.99 treated the wall as a two-click reference face. A second click
      // that lands effectively on the first point is ignored instead of
      // manufacturing a default-length wall.
      if (Number(preview.rawLength) < 0.125) {
        return { preview: current as JsonObject };
      }

      return {
        preview: chainedWallPreview(context, preview),
        commands: [
          addRoomFeature(
            layout.id,
            featureFromWallPreview(preview, createId('room-feature')),
          ),
        ],
        transactionLabel: 'Add wall',
      };
    },
    onPointerMove(context, input) {
      if (!currentWallPreview(context.state)) return;
      const preview = updateWallPreview(context, input);
      return preview ? { preview } : undefined;
    },
    onPointerUp(context) {
      const preview = currentWallPreview(context.state);
      return preview ? { preview: preview as JsonObject } : undefined;
    },
  };
}

/**
 * Production Room Feature tool handlers.
 *
 * `roomFeatures` is intentionally a parent interaction layer, not a placement
 * tool. Q enters/leaves that layer without arming a cabinet stamp. Free walls
 * retain the v1.5.99 two-click reference-face flow, while Linked Walls retain
 * the add/erase edge-brush contract.
 */
export function registerProductionRoomFeatureToolHandlers(
  register: (tool: ToolId, handler: ToolHandler) => () => void,
  createId: RoomFeatureIdFactory,
): Array<() => void> {
  return [
    register('roomWall', roomWallHandler(createId)),
    register('linkedWall', createLinkedWallBrushHandler(createId)),
  ];
}
