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

type PlacementTool = 'roomFeatures' | 'roomWall';

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

function createPreview(
  context: ToolHandlerContext,
  input: ToolPointerInput,
  tool: PlacementTool,
): JsonObject | null {
  const layout = activeLayout(context.state);
  if (!layout) return null;
  const snap = resolveRoomFeaturePointer(context.state, input);
  const wall = tool === 'roomWall';
  const depth = wall ? wallThickness(context) : 24;

  return {
    kind: 'room-feature-create',
    tool,
    startX: snap.point.x,
    startY: snap.point.y,
    x: snap.point.x,
    y: wall ? snap.point.y - depth / 2 : snap.point.y,
    length: wall ? 0.25 : 36,
    depth,
    rotation: 0,
    featureType: wall ? 'wall' : 'base',
    wallType: wall ? roomWallType(context) : null,
    guideX: snap.guideX,
    guideY: snap.guideY,
    snapX: snap.snapped ? snap.point.x : null,
    snapY: snap.snapped ? snap.point.y : null,
  };
}

function currentPreview(
  state: ReadonlyApplicationState,
): Record<string, unknown> | null {
  const raw = state.session.interaction.preview;
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  return record.kind === 'room-feature-create' ? record : null;
}

function updatePreview(
  context: ToolHandlerContext,
  input: ToolPointerInput,
  tool: PlacementTool,
): JsonObject | null {
  const current = currentPreview(context.state);
  if (!current || current.tool !== tool) return createPreview(context, input, tool);
  const snap = resolveRoomFeaturePointer(context.state, input);

  if (tool === 'roomFeatures') {
    return {
      ...current,
      x: snap.point.x,
      y: snap.point.y,
      guideX: snap.guideX,
      guideY: snap.guideY,
      snapX: snap.snapped ? snap.point.x : null,
      snapY: snap.snapped ? snap.point.y : null,
    };
  }

  const start = {
    x: Number(current.startX) || 0,
    y: Number(current.startY) || 0,
  };
  const end = weakStraightPoint(start, snap.point, input.modifiers.shift);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(0.25, Math.hypot(dx, dy));
  const rotation = normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI);
  const center = {
    x: start.x + dx / 2,
    y: start.y + dy / 2,
  };
  const depth = wallThickness(context);

  return {
    ...current,
    x: round3(center.x - length / 2),
    y: round3(center.y - depth / 2),
    length: round3(length),
    depth,
    wallType: roomWallType(context),
    rotation: round3(rotation),
    guideX: snap.guideX,
    guideY: snap.guideY,
    snapX: snap.snapped ? end.x : null,
    snapY: snap.snapped ? end.y : null,
  };
}

function featureFromPreview(
  preview: Record<string, unknown>,
  id: string,
): RoomFeature {
  const wall = preview.tool === 'roomWall';
  const wallType = wall
    ? preview.wallType === 'knee'
      ? 'knee'
      : 'full'
    : null;
  const name = wall
    ? wallType === 'knee'
      ? 'Knee Wall'
      : 'Wall'
    : 'Base Cabinet';

  return createRoomFeature(id, wall ? 'wall' : 'base', {
    kind: wall ? 'wall' : 'feature',
    name,
    x: Number(preview.x) || 0,
    y: Number(preview.y) || 0,
    length: Number(preview.length) || (wall ? 96 : 36),
    depth: Number(preview.depth) || (wall ? 4.5 : 24),
    rotation: Number(preview.rotation) || 0,
    wallType,
    receivesCountertop: !wall,
  });
}

function placementHandler(
  tool: PlacementTool,
  createId: RoomFeatureIdFactory,
): ToolHandler {
  return {
    onPointerDown(context, input) {
      if (input.button !== 0 || !activeLayout(context.state)) return;
      return { preview: createPreview(context, input, tool) };
    },
    onPointerMove(context, input) {
      if (!activeLayout(context.state)) return;
      return { preview: updatePreview(context, input, tool) };
    },
    onPointerUp(context, input) {
      const layout = activeLayout(context.state);
      if (!layout) return { preview: null };
      let preview = updatePreview(context, input, tool);
      if (!preview) return { preview: null };

      if (
        tool === 'roomWall' &&
        Number(preview.length) < 2 / Math.max(0.001, Math.abs(layout.scale || 1))
      ) {
        const startX = Number(preview.startX) || input.x;
        const startY = Number(preview.startY) || input.y;
        const depth = wallThickness(context);
        preview = {
          ...preview,
          x: startX,
          y: startY - depth / 2,
          depth,
          wallType: roomWallType(context),
          length: 96,
          rotation: 0,
        };
      }

      return {
        preview: null,
        commands: [
          addRoomFeature(
            layout.id,
            featureFromPreview(preview, createId('room-feature')),
          ),
        ],
        transactionLabel:
          tool === 'roomFeatures' ? 'Add room feature' : 'Add wall',
      };
    },
  };
}

/**
 * Batch 59 production placement handlers. Room Feature and free-wall creation
 * retain the established typed flow, while Linked Walls use the v1.5.99
 * add/erase edge-brush contract.
 */
export function registerProductionRoomFeatureToolHandlers(
  register: (tool: ToolId, handler: ToolHandler) => () => void,
  createId: RoomFeatureIdFactory,
): Array<() => void> {
  return [
    register('roomFeatures', placementHandler('roomFeatures', createId)),
    register('roomWall', placementHandler('roomWall', createId)),
    register('linkedWall', createLinkedWallBrushHandler(createId)),
  ];
}
