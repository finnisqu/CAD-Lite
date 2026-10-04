import { normalizeDegrees, round3 } from '../../core/numeric';
import {
  createRoomFeature,
  type RoomFeature,
  type RoomFeaturePatch,
  type RoomWallType,
} from '../../domain/room-features';
import { piecePoseBounds } from '../../domain/pieces';
import type { Layout } from '../../domain/project';
import type { JsonObject, JsonValue } from '../../domain/types';
import {
  constrainPointToAxes,
  distanceBetween,
  normalizeViewportScale,
  pointAngleDegrees,
  rotateVector,
  screenDistanceToWorld,
  snapAngleToIncrement,
} from '../../geometry';
import {
  addRoomFeature,
  updateRoomFeature,
} from '../commands/room-features';
import {
  replaceInteractionState,
  setSelection,
} from '../commands/session';
import type { CommandDispatcher } from '../commands/dispatcher';
import type { ReadonlyApplicationState } from '../state';
import type { AppStore } from '../store';
import {
  clearPointerInteraction,
  interactionWithPointer,
} from './pointer-session';
import type {
  ToolHandler,
  ToolHandlerContext,
  ToolId,
  ToolPointerInput,
} from './types';

export type RoomFeatureIdFactory = (prefix: string) => string;
export type RoomFeatureResizeSide = 'top' | 'right' | 'bottom' | 'left';

export interface RoomFeatureSnapResult {
  point: { x: number; y: number };
  guideX: number | null;
  guideY: number | null;
  snapped: boolean;
}

export interface RoomFeatureEditPreview {
  kind: 'room-feature-edit';
  id: string;
  patch: RoomFeaturePatch;
  guideX: number | null;
  guideY: number | null;
  snapX: number | null;
  snapY: number | null;
}

function activeLayout(state: ReadonlyApplicationState): Layout | null {
  if (state.session.workspace !== 'design') return null;
  return (
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null
  );
}

function nearestAxis(
  value: number,
  targets: readonly number[],
  tolerance: number,
): number | null {
  let best: number | null = null;
  let distance = tolerance;
  targets.forEach((target) => {
    const next = Math.abs(target - value);
    if (next <= distance) {
      distance = next;
      best = target;
    }
  });
  return best;
}

export function resolveRoomFeaturePointer(
  state: ReadonlyApplicationState,
  input: ToolPointerInput,
  excludeId: string | null = null,
): RoomFeatureSnapResult {
  const raw = { x: input.x, y: input.y };
  const layout = activeLayout(state);
  if (!layout || input.modifiers.alt) {
    return { point: raw, guideX: null, guideY: null, snapped: false };
  }

  const tolerance = screenDistanceToWorld(8, layout.scale);
  const xs: number[] = [];
  const ys: number[] = [];

  if (state.preferences.pieceSnap) {
    layout.pieces.forEach((piece) => {
      const bounds = piecePoseBounds(piece, 'design');
      xs.push(bounds.x, bounds.x + bounds.w / 2, bounds.x + bounds.w);
      ys.push(bounds.y, bounds.y + bounds.h / 2, bounds.y + bounds.h);
    });

    layout.roomFeatures.forEach((feature) => {
      if (feature.id === excludeId) return;
      xs.push(
        feature.x,
        feature.x + feature.length / 2,
        feature.x + feature.length,
      );
      ys.push(
        feature.y,
        feature.y + feature.depth / 2,
        feature.y + feature.depth,
      );
    });
  }

  const objectX = nearestAxis(raw.x, xs, tolerance);
  const objectY = nearestAxis(raw.y, ys, tolerance);
  if (objectX !== null || objectY !== null) {
    return {
      point: {
        x: objectX ?? raw.x,
        y: objectY ?? raw.y,
      },
      guideX: objectX,
      guideY: objectY,
      snapped: true,
    };
  }

  if (state.preferences.gridSnap && layout.grid > 0) {
    const point = {
      x: Math.round(raw.x / layout.grid) * layout.grid,
      y: Math.round(raw.y / layout.grid) * layout.grid,
    };
    return {
      point,
      guideX: point.x !== raw.x ? point.x : null,
      guideY: point.y !== raw.y ? point.y : null,
      snapped: point.x !== raw.x || point.y !== raw.y,
    };
  }

  return { point: raw, guideX: null, guideY: null, snapped: false };
}

function createPreview(
  context: ToolHandlerContext,
  input: ToolPointerInput,
  tool: 'roomFeatures' | 'roomWall' | 'linkedWall',
): JsonObject | null {
  const layout = activeLayout(context.state);
  if (!layout) return null;
  const snap = resolveRoomFeaturePointer(context.state, input);
  const wall = tool !== 'roomFeatures';
  return {
    kind: 'room-feature-create',
    tool,
    startX: snap.point.x,
    startY: snap.point.y,
    x: snap.point.x,
    y: wall ? snap.point.y - 2 : snap.point.y,
    length: wall ? 0.25 : 36,
    depth: wall ? 4 : 24,
    rotation: 0,
    featureType:
      tool === 'linkedWall'
        ? 'linked-wall'
        : tool === 'roomWall'
          ? 'wall'
          : 'base',
    wallType:
      tool === 'linkedWall' ? 'linked' : tool === 'roomWall' ? 'full' : null,
    guideX: snap.guideX,
    guideY: snap.guideY,
    snapX: snap.snapped ? snap.point.x : null,
    snapY: snap.snapped ? snap.point.y : null,
  };
}

function roomCreatePreview(
  state: ReadonlyApplicationState,
): Record<string, unknown> | null {
  const raw = state.session.interaction.preview;
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  return record.kind === 'room-feature-create' ? record : null;
}

function updateCreatePreview(
  context: ToolHandlerContext,
  input: ToolPointerInput,
  tool: 'roomFeatures' | 'roomWall' | 'linkedWall',
): JsonObject | null {
  const current = roomCreatePreview(context.state);
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
    } as JsonObject;
  }

  const start = {
    x: Number(current.startX) || 0,
    y: Number(current.startY) || 0,
  };
  const end = constrainPointToAxes(start, snap.point, input.modifiers.shift, 3).point;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(0.25, Math.hypot(dx, dy));
  const rotation = normalizeDegrees(pointAngleDegrees(start, end));
  const center = {
    x: start.x + dx / 2,
    y: start.y + dy / 2,
  };

  return {
    ...current,
    x: round3(center.x - length / 2),
    y: round3(center.y - 2),
    length: round3(length),
    rotation: round3(rotation),
    guideX: snap.guideX,
    guideY: snap.guideY,
    snapX: snap.snapped ? end.x : null,
    snapY: snap.snapped ? end.y : null,
  } as JsonObject;
}

function createFeatureFromPreview(
  preview: Record<string, unknown>,
  id: string,
): RoomFeature {
  const tool = preview.tool;
  const wallType: RoomWallType =
    tool === 'linkedWall' ? 'linked' : tool === 'roomWall' ? 'full' : null;
  const wall = wallType !== null;
  return createRoomFeature(
    id,
    wall ? (wallType === 'linked' ? 'linked-wall' : 'wall') : 'base',
    {
      kind: wall ? 'wall' : 'feature',
      name: wall
        ? wallType === 'linked'
          ? 'Linked Wall'
          : 'Wall'
        : 'Base Cabinet',
      x: Number(preview.x) || 0,
      y: Number(preview.y) || 0,
      length: Number(preview.length) || (wall ? 96 : 36),
      depth: Number(preview.depth) || (wall ? 4 : 24),
      rotation: Number(preview.rotation) || 0,
      wallType,
      receivesCountertop: !wall,
    },
  );
}

function placementHandler(
  tool: 'roomFeatures' | 'roomWall' | 'linkedWall',
  createId: RoomFeatureIdFactory,
): ToolHandler {
  return {
    onPointerDown(context, input) {
      if (input.button !== 0 || !activeLayout(context.state)) return;
      return { preview: createPreview(context, input, tool) };
    },
    onPointerMove(context, input) {
      if (!activeLayout(context.state)) return;
      return { preview: updateCreatePreview(context, input, tool) };
    },
    onPointerUp(context, input) {
      const layout = activeLayout(context.state);
      if (!layout) return { preview: null };
      let preview = updateCreatePreview(context, input, tool);
      if (!preview) return { preview: null };

      if (
        tool !== 'roomFeatures' &&
        Number(preview.length) < screenDistanceToWorld(2, layout.scale)
      ) {
        const startX = Number(preview.startX) || input.x;
        const startY = Number(preview.startY) || input.y;
        preview = {
          ...preview,
          x: startX,
          y: startY - 2,
          length: 96,
          rotation: 0,
        };
      }

      return {
        preview: null,
        commands: [
          addRoomFeature(
            layout.id,
            createFeatureFromPreview(preview, createId('room-feature')),
          ),
        ],
        transactionLabel:
          tool === 'roomFeatures'
            ? 'Add room feature'
            : tool === 'linkedWall'
              ? 'Add linked wall'
              : 'Add wall',
      };
    },
  };
}

export function registerRoomFeatureToolHandlers(
  register: (tool: ToolId, handler: ToolHandler) => () => void,
  createId: RoomFeatureIdFactory,
): Array<() => void> {
  return [
    register('roomFeatures', placementHandler('roomFeatures', createId)),
    register('roomWall', placementHandler('roomWall', createId)),
    register('linkedWall', placementHandler('linkedWall', createId)),
  ];
}

interface BaseEditSession {
  layoutId: string;
  id: string;
  pointerId: number;
  start: { x: number; y: number };
  scale: number;
  moved: boolean;
  preview: RoomFeatureEditPreview | null;
}

interface MoveSession extends BaseEditSession {
  kind: 'move';
  original: { x: number; y: number };
  pointerOffset: { x: number; y: number };
}

interface ResizeSession extends BaseEditSession {
  kind: 'resize';
  side: RoomFeatureResizeSide;
  original: Pick<RoomFeature, 'x' | 'y' | 'length' | 'depth' | 'rotation'>;
  center: { x: number; y: number };
}

interface RotateSession extends BaseEditSession {
  kind: 'rotate';
  center: { x: number; y: number };
  startPointerAngle: number;
  originalRotation: number;
}

type EditSession = MoveSession | ResizeSession | RotateSession;

function previewJson(preview: RoomFeatureEditPreview | null): JsonValue {
  if (!preview) return null;
  return {
    kind: preview.kind,
    id: preview.id,
    patch: { ...(preview.patch as JsonObject) },
    guideX: preview.guideX,
    guideY: preview.guideY,
    snapX: preview.snapX,
    snapY: preview.snapY,
  };
}

function clearInteraction(state: ReadonlyApplicationState) {
  return replaceInteractionState(
    clearPointerInteraction(state.session.interaction),
  );
}

function pointerInteraction(
  state: ReadonlyApplicationState,
  session: EditSession,
  input: ToolPointerInput,
  preview: RoomFeatureEditPreview | null,
) {
  return replaceInteractionState(
    interactionWithPointer(
      state.session.interaction,
      session.start,
      input,
      previewJson(preview),
    ),
  );
}

export class RoomFeatureInteractionController {
  private session: EditSession | null = null;

  constructor(
    private readonly store: AppStore,
    private readonly commands: CommandDispatcher,
  ) {}

  hasActivePointer(): boolean {
    return this.session !== null;
  }

  getPreview(): RoomFeatureEditPreview | null {
    const session = this.session;
    if (!session) return null;
    const state = this.store.getState();
    if (
      state.session.workspace !== 'design' ||
      state.session.activeLayoutId !== session.layoutId
    ) {
      this.session = null;
      return null;
    }
    return session.preview;
  }

  beginMove(id: string, input: ToolPointerInput): boolean {
    const state = this.store.getState();
    const layout = activeLayout(state);
    const feature = layout?.roomFeatures.find((item) => item.id === id);
    if (
      !layout ||
      !feature ||
      input.button !== 0 ||
      state.session.interaction.activeTool
    ) {
      return false;
    }

    this.commands.execute(setSelection({ kind: 'roomFeature', id }));
    this.session = {
      kind: 'move',
      layoutId: layout.id,
      id,
      pointerId: input.pointerId,
      start: { x: input.x, y: input.y },
      scale: normalizeViewportScale(layout.scale),
      moved: false,
      preview: null,
      original: { x: feature.x, y: feature.y },
      pointerOffset: {
        x: input.x - feature.x,
        y: input.y - feature.y,
      },
    };
    this.commands.execute(pointerInteraction(this.store.getState(), this.session, input, null));
    return true;
  }

  beginResize(
    id: string,
    side: RoomFeatureResizeSide,
    input: ToolPointerInput,
  ): boolean {
    const state = this.store.getState();
    const layout = activeLayout(state);
    const feature = layout?.roomFeatures.find((item) => item.id === id);
    if (
      !layout ||
      !feature ||
      input.button !== 0 ||
      state.session.interaction.activeTool
    ) {
      return false;
    }

    this.commands.execute(setSelection({ kind: 'roomFeature', id }));
    this.session = {
      kind: 'resize',
      layoutId: layout.id,
      id,
      pointerId: input.pointerId,
      start: { x: input.x, y: input.y },
      scale: normalizeViewportScale(layout.scale),
      moved: false,
      preview: null,
      side,
      original: {
        x: feature.x,
        y: feature.y,
        length: feature.length,
        depth: feature.depth,
        rotation: feature.rotation,
      },
      center: {
        x: feature.x + feature.length / 2,
        y: feature.y + feature.depth / 2,
      },
    };
    this.commands.execute(pointerInteraction(this.store.getState(), this.session, input, null));
    return true;
  }

  beginRotate(id: string, input: ToolPointerInput): boolean {
    const state = this.store.getState();
    const layout = activeLayout(state);
    const feature = layout?.roomFeatures.find((item) => item.id === id);
    if (
      !layout ||
      !feature ||
      input.button !== 0 ||
      state.session.interaction.activeTool
    ) {
      return false;
    }

    const center = {
      x: feature.x + feature.length / 2,
      y: feature.y + feature.depth / 2,
    };
    this.commands.execute(setSelection({ kind: 'roomFeature', id }));
    this.session = {
      kind: 'rotate',
      layoutId: layout.id,
      id,
      pointerId: input.pointerId,
      start: { x: input.x, y: input.y },
      scale: normalizeViewportScale(layout.scale),
      moved: false,
      preview: null,
      center,
      startPointerAngle: pointAngleDegrees(center, {
        x: input.x,
        y: input.y,
      }),
      originalRotation: feature.rotation,
    };
    this.commands.execute(pointerInteraction(this.store.getState(), this.session, input, null));
    return true;
  }

  pointerMove(input: ToolPointerInput): boolean {
    const session = this.session;
    if (!session || session.pointerId !== input.pointerId) return false;
    const state = this.store.getState();
    const preview = this.previewFor(state, session, input);
    if (!preview) return false;

    session.preview = preview;
    session.moved =
      distanceBetween(session.start, { x: input.x, y: input.y }) >
      screenDistanceToWorld(2, session.scale);
    this.commands.execute(pointerInteraction(state, session, input, preview));
    return true;
  }

  pointerUp(input: ToolPointerInput): boolean {
    const session = this.session;
    if (!session || session.pointerId !== input.pointerId) return false;
    this.session = null;
    const state = this.store.getState();
    const cleanup = clearInteraction(state);

    if (!session.moved || !session.preview) {
      return this.commands.execute(cleanup) !== null;
    }

    const label =
      session.kind === 'move'
        ? 'Move room feature'
        : session.kind === 'resize'
          ? 'Resize room feature'
          : 'Rotate room feature';
    return (
      this.commands.executeTransaction(
        label,
        [
          updateRoomFeature(
            session.layoutId,
            session.id,
            session.preview.patch,
          ),
          cleanup,
        ],
      ) !== null
    );
  }

  cancel(): boolean {
    if (!this.session) return false;
    this.session = null;
    return this.commands.execute(clearInteraction(this.store.getState())) !== null;
  }

  private previewFor(
    state: ReadonlyApplicationState,
    session: EditSession,
    input: ToolPointerInput,
  ): RoomFeatureEditPreview | null {
    const layout = activeLayout(state);
    if (!layout || layout.id !== session.layoutId) return null;

    if (session.kind === 'move') {
      const rawInput = {
        ...input,
        x: input.x - session.pointerOffset.x,
        y: input.y - session.pointerOffset.y,
      };
      const snap = resolveRoomFeaturePointer(state, rawInput, session.id);
      const point = {
        x: round3(snap.point.x),
        y: round3(snap.point.y),
      };
      return {
        kind: 'room-feature-edit',
        id: session.id,
        patch: point,
        guideX: snap.guideX,
        guideY: snap.guideY,
        snapX: snap.snapped ? point.x : null,
        snapY: snap.snapped ? point.y : null,
      };
    }

    if (session.kind === 'rotate') {
      const angle = pointAngleDegrees(session.center, {
        x: input.x,
        y: input.y,
      });
      let rotation =
        session.originalRotation + angle - session.startPointerAngle;
      const cardinal = snapAngleToIncrement(rotation, 90);
      if (input.modifiers.shift) {
        rotation = cardinal;
      } else if (!input.modifiers.alt && Math.abs(rotation - cardinal) <= 5) {
        rotation = cardinal;
      }
      return {
        kind: 'room-feature-edit',
        id: session.id,
        patch: { rotation: round3(normalizeDegrees(rotation)) },
        guideX: null,
        guideY: null,
        snapX: null,
        snapY: null,
      };
    }

    const snapped = resolveRoomFeaturePointer(state, input, session.id);
    const delta = rotateVector(
      snapped.point.x - session.start.x,
      snapped.point.y - session.start.y,
      -session.original.rotation,
    );
    let length = session.original.length;
    let depth = session.original.depth;
    let centerShiftX = 0;
    let centerShiftY = 0;

    if (session.side === 'right') {
      length = Math.max(0.25, session.original.length + delta.x);
      centerShiftX = (length - session.original.length) / 2;
    } else if (session.side === 'left') {
      length = Math.max(0.25, session.original.length - delta.x);
      centerShiftX = -(length - session.original.length) / 2;
    } else if (session.side === 'bottom') {
      depth = Math.max(0.25, session.original.depth + delta.y);
      centerShiftY = (depth - session.original.depth) / 2;
    } else {
      depth = Math.max(0.25, session.original.depth - delta.y);
      centerShiftY = -(depth - session.original.depth) / 2;
    }

    const centerDelta = rotateVector(
      centerShiftX,
      centerShiftY,
      session.original.rotation,
    );
    const center = {
      x: session.center.x + centerDelta.x,
      y: session.center.y + centerDelta.y,
    };

    return {
      kind: 'room-feature-edit',
      id: session.id,
      patch: {
        x: round3(center.x - length / 2),
        y: round3(center.y - depth / 2),
        length: round3(length),
        depth: round3(depth),
      },
      guideX: snapped.guideX,
      guideY: snapped.guideY,
      snapX: snapped.snapped ? snapped.point.x : null,
      snapY: snapped.snapped ? snapped.point.y : null,
    };
  }
}
