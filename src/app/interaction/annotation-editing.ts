import { clamp, round3 } from '../../core/numeric';
import type {
  AnnotationPoint,
  DimensionPatch,
  DrawingLinePatch,
  CanvasNotePatch,
} from '../../domain/annotations';
import type { Layout } from '../../domain/project';
import type { JsonObject, JsonValue } from '../../domain/types';
import {
  updateCanvasNote,
  updateDimension,
  updateDrawingLine,
} from '../commands/annotations';
import { replaceInteractionState, setSelection } from '../commands/session';
import type { CommandDispatcher } from '../commands/dispatcher';
import type { ReadonlyApplicationState } from '../state';
import type { AppStore } from '../store';
import {
  constrainAnnotationPoint,
  resolveAnnotationPointer,
} from './annotations';
import type { ToolPointerInput } from './types';

export type AnnotationEndpoint = 'start' | 'end';

export interface AnnotationEditPreview {
  kind: 'annotation-edit';
  entityKind: 'dimension' | 'line' | 'note';
  id: string;
  patch: DimensionPatch | DrawingLinePatch | CanvasNotePatch;
  guideX: number | null;
  guideY: number | null;
  snapX: number | null;
  snapY: number | null;
}

interface BaseSession {
  layoutId: string;
  pointerId: number;
  start: AnnotationPoint;
  scale: number;
  moved: boolean;
  preview: AnnotationEditPreview | null;
}

interface DimensionEndpointSession extends BaseSession {
  kind: 'dimension-endpoint';
  id: string;
  endpoint: AnnotationEndpoint;
  fixed: AnnotationPoint;
  original: AnnotationPoint;
}

interface DimensionOffsetSession extends BaseSession {
  kind: 'dimension-offset';
  id: string;
  x1: number;
  y1: number;
  nx: number;
  ny: number;
  originalOffsetPx: number;
}

interface LineEndpointSession extends BaseSession {
  kind: 'line-endpoint';
  id: string;
  endpoint: AnnotationEndpoint;
  fixed: AnnotationPoint;
  original: AnnotationPoint;
}

interface NoteMoveSession extends BaseSession {
  kind: 'note-move';
  id: string;
  original: AnnotationPoint;
  pointerOffset: AnnotationPoint;
}

type AnnotationSession =
  | DimensionEndpointSession
  | DimensionOffsetSession
  | LineEndpointSession
  | NoteMoveSession;

function activeLayout(state: ReadonlyApplicationState): Layout | null {
  if (state.session.workspace !== 'design') return null;
  return (
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null
  );
}

function nearbyAnnotationAxes(
  state: ReadonlyApplicationState,
  point: AnnotationPoint,
  excludeId: string,
): {
  point: AnnotationPoint;
  guideX: number | null;
  guideY: number | null;
} {
  const layout = activeLayout(state);
  if (!layout || !state.preferences.pieceSnap) {
    return { point, guideX: null, guideY: null };
  }

  const tolerance = 6 / Math.max(0.001, Math.abs(layout.scale || 1));
  const anchors: AnnotationPoint[] = [];
  layout.dims.forEach((item) => {
    if (item.id === excludeId) return;
    anchors.push({ x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 });
  });
  layout.lines.forEach((item) => {
    if (item.id === excludeId) return;
    anchors.push({ x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 });
  });
  layout.notes.forEach((item) => {
    if (item.id === excludeId) return;
    anchors.push({ x: item.x, y: item.y });
  });

  let x = point.x;
  let y = point.y;
  let guideX: number | null = null;
  let guideY: number | null = null;
  let xDistance = tolerance;
  let yDistance = tolerance;

  anchors.forEach((anchor) => {
    const dx = Math.abs(anchor.x - point.x);
    if (dx <= xDistance) {
      xDistance = dx;
      x = anchor.x;
      guideX = anchor.x;
    }
    const dy = Math.abs(anchor.y - point.y);
    if (dy <= yDistance) {
      yDistance = dy;
      y = anchor.y;
      guideY = anchor.y;
    }
  });

  return { point: { x, y }, guideX, guideY };
}

function resolvedEndpoint(
  state: ReadonlyApplicationState,
  input: ToolPointerInput,
  fixed: AnnotationPoint,
  excludeId: string,
): {
  point: AnnotationPoint;
  guideX: number | null;
  guideY: number | null;
  snapX: number | null;
  snapY: number | null;
} {
  const snapped = resolveAnnotationPointer(state, input);
  let point = snapped.point;
  let guideX = snapped.guideX;
  let guideY = snapped.guideY;

  if (!input.modifiers.alt && !snapped.snapped) {
    const aligned = nearbyAnnotationAxes(state, point, excludeId);
    point = aligned.point;
    guideX = aligned.guideX ?? guideX;
    guideY = aligned.guideY ?? guideY;
  }

  const constrained = constrainAnnotationPoint(
    fixed,
    point,
    input.modifiers.shift,
    3,
  );
  point = constrained.point;
  guideX = constrained.guideX ?? guideX;
  guideY = constrained.guideY ?? guideY;

  return {
    point: { x: round3(point.x), y: round3(point.y) },
    guideX,
    guideY,
    snapX: snapped.snapped ? point.x : null,
    snapY: snapped.snapped ? point.y : null,
  };
}

function previewJson(preview: AnnotationEditPreview | null): JsonValue {
  if (!preview) return null;
  return {
    kind: preview.kind,
    entityKind: preview.entityKind,
    id: preview.id,
    patch: { ...(preview.patch as JsonObject) },
    guideX: preview.guideX,
    guideY: preview.guideY,
    snapX: preview.snapX,
    snapY: preview.snapY,
  };
}

function clearInteraction(state: ReadonlyApplicationState) {
  return replaceInteractionState({
    ...state.session.interaction,
    pointer: null,
    preview: null,
  });
}

export class AnnotationInteractionController {
  private session: AnnotationSession | null = null;

  constructor(
    private readonly store: AppStore,
    private readonly commands: CommandDispatcher,
  ) {}

  hasActivePointer(): boolean {
    return this.session !== null;
  }

  getPreview(): AnnotationEditPreview | null {
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

  beginDimensionEndpoint(
    id: string,
    endpoint: AnnotationEndpoint,
    input: ToolPointerInput,
  ): boolean {
    const state = this.store.getState();
    const layout = activeLayout(state);
    const item = layout?.dims.find((dimension) => dimension.id === id);
    if (!layout || !item || input.button !== 0 || state.session.interaction.activeTool) {
      return false;
    }

    const original =
      endpoint === 'start'
        ? { x: item.x1, y: item.y1 }
        : { x: item.x2, y: item.y2 };
    const fixed =
      endpoint === 'start'
        ? { x: item.x2, y: item.y2 }
        : { x: item.x1, y: item.y1 };

    this.commands.execute(setSelection({ kind: 'dimension', id }));
    this.session = {
      kind: 'dimension-endpoint',
      layoutId: layout.id,
      pointerId: input.pointerId,
      start: { x: input.x, y: input.y },
      scale: Math.max(0.001, Math.abs(layout.scale || 1)),
      moved: false,
      preview: null,
      id,
      endpoint,
      fixed,
      original,
    };
    this.beginPointerState(input);
    return true;
  }

  beginDimensionOffset(id: string, input: ToolPointerInput): boolean {
    const state = this.store.getState();
    const layout = activeLayout(state);
    const item = layout?.dims.find((dimension) => dimension.id === id);
    if (!layout || !item || input.button !== 0 || state.session.interaction.activeTool) {
      return false;
    }

    const dx = item.x2 - item.x1;
    const dy = item.y2 - item.y1;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return false;

    this.commands.execute(setSelection({ kind: 'dimension', id }));
    this.session = {
      kind: 'dimension-offset',
      layoutId: layout.id,
      pointerId: input.pointerId,
      start: { x: input.x, y: input.y },
      scale: Math.max(0.001, Math.abs(layout.scale || 1)),
      moved: false,
      preview: null,
      id,
      x1: item.x1,
      y1: item.y1,
      nx: -dy / length,
      ny: dx / length,
      originalOffsetPx: item.offsetPx,
    };
    this.beginPointerState(input);
    return true;
  }

  beginLineEndpoint(
    id: string,
    endpoint: AnnotationEndpoint,
    input: ToolPointerInput,
  ): boolean {
    const state = this.store.getState();
    const layout = activeLayout(state);
    const item = layout?.lines.find((line) => line.id === id);
    if (!layout || !item || input.button !== 0 || state.session.interaction.activeTool) {
      return false;
    }
    if (item.attachedNoteId && item.attachedEnd === endpoint) return false;

    const original =
      endpoint === 'start'
        ? { x: item.x1, y: item.y1 }
        : { x: item.x2, y: item.y2 };
    const fixed =
      endpoint === 'start'
        ? { x: item.x2, y: item.y2 }
        : { x: item.x1, y: item.y1 };

    this.commands.execute(setSelection({ kind: 'line', id }));
    this.session = {
      kind: 'line-endpoint',
      layoutId: layout.id,
      pointerId: input.pointerId,
      start: { x: input.x, y: input.y },
      scale: Math.max(0.001, Math.abs(layout.scale || 1)),
      moved: false,
      preview: null,
      id,
      endpoint,
      fixed,
      original,
    };
    this.beginPointerState(input);
    return true;
  }

  beginNoteMove(id: string, input: ToolPointerInput): boolean {
    const state = this.store.getState();
    const layout = activeLayout(state);
    const item = layout?.notes.find((note) => note.id === id);
    if (!layout || !item || input.button !== 0 || state.session.interaction.activeTool) {
      return false;
    }

    this.commands.execute(setSelection({ kind: 'note', id }));
    this.session = {
      kind: 'note-move',
      layoutId: layout.id,
      pointerId: input.pointerId,
      start: { x: input.x, y: input.y },
      scale: Math.max(0.001, Math.abs(layout.scale || 1)),
      moved: false,
      preview: null,
      id,
      original: { x: item.x, y: item.y },
      pointerOffset: { x: input.x - item.x, y: input.y - item.y },
    };
    this.beginPointerState(input);
    return true;
  }

  pointerMove(input: ToolPointerInput): boolean {
    const session = this.session;
    if (!session || session.pointerId !== input.pointerId) return false;

    const state = this.store.getState();
    const preview = this.previewFor(state, session, input);
    if (!preview) {
      this.cancel();
      return false;
    }

    session.preview = preview;
    session.moved =
      Math.hypot(input.x - session.start.x, input.y - session.start.y) >
      2 / session.scale;

    const interaction = state.session.interaction;
    this.commands.execute(
      replaceInteractionState({
        ...interaction,
        pointer: {
          pointerId: input.pointerId,
          startX: session.start.x,
          startY: session.start.y,
          x: input.x,
          y: input.y,
          buttons: input.buttons,
          modifiers: { ...input.modifiers },
        },
        preview: previewJson(preview),
      }),
    );
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

    const command =
      session.preview.entityKind === 'dimension'
        ? updateDimension(
            session.layoutId,
            session.preview.id,
            session.preview.patch as DimensionPatch,
          )
        : session.preview.entityKind === 'line'
          ? updateDrawingLine(
              session.layoutId,
              session.preview.id,
              session.preview.patch as DrawingLinePatch,
            )
          : updateCanvasNote(
              session.layoutId,
              session.preview.id,
              session.preview.patch as CanvasNotePatch,
            );

    const label =
      session.kind === 'dimension-offset'
        ? 'Move dimension label'
        : session.kind === 'note-move'
          ? 'Move note'
          : 'Move annotation endpoint';

    return (
      this.commands.executeTransaction(label, [command, cleanup]) !== null
    );
  }

  cancel(): boolean {
    if (!this.session) return false;
    this.session = null;
    return this.commands.execute(clearInteraction(this.store.getState())) !== null;
  }

  private beginPointerState(input: ToolPointerInput): void {
    const session = this.session;
    if (!session) return;
    const state = this.store.getState();
    this.commands.execute(
      replaceInteractionState({
        ...state.session.interaction,
        pointer: {
          pointerId: input.pointerId,
          startX: session.start.x,
          startY: session.start.y,
          x: input.x,
          y: input.y,
          buttons: input.buttons,
          modifiers: { ...input.modifiers },
        },
        preview: null,
      }),
    );
  }

  private previewFor(
    state: ReadonlyApplicationState,
    session: AnnotationSession,
    input: ToolPointerInput,
  ): AnnotationEditPreview | null {
    const layout = activeLayout(state);
    if (!layout || layout.id !== session.layoutId) return null;

    if (session.kind === 'dimension-offset') {
      const distance =
        (input.x - session.x1) * session.nx +
        (input.y - session.y1) * session.ny;
      const offsetPx = clamp(distance * session.scale, -300, 300);
      return {
        kind: 'annotation-edit',
        entityKind: 'dimension',
        id: session.id,
        patch: { offsetPx: Math.round(offsetPx * 1000) / 1000 },
        guideX: null,
        guideY: null,
        snapX: null,
        snapY: null,
      };
    }

    if (session.kind === 'note-move') {
      const raw = {
        ...input,
        x: input.x - session.pointerOffset.x,
        y: input.y - session.pointerOffset.y,
      };
      const snapped = resolveAnnotationPointer(state, raw);
      const aligned =
        !input.modifiers.alt && !snapped.snapped
          ? nearbyAnnotationAxes(state, snapped.point, session.id)
          : { point: snapped.point, guideX: null, guideY: null };
      const point = {
        x: round3(aligned.point.x),
        y: round3(aligned.point.y),
      };
      return {
        kind: 'annotation-edit',
        entityKind: 'note',
        id: session.id,
        patch: point,
        guideX: aligned.guideX ?? snapped.guideX,
        guideY: aligned.guideY ?? snapped.guideY,
        snapX: snapped.snapped ? point.x : null,
        snapY: snapped.snapped ? point.y : null,
      };
    }

    const resolved = resolvedEndpoint(
      state,
      input,
      session.fixed,
      session.id,
    );
    if (
      Math.hypot(
        resolved.point.x - session.fixed.x,
        resolved.point.y - session.fixed.y,
      ) < 0.001
    ) {
      return null;
    }

    const patch =
      session.endpoint === 'start'
        ? { x1: resolved.point.x, y1: resolved.point.y }
        : { x2: resolved.point.x, y2: resolved.point.y };

    return {
      kind: 'annotation-edit',
      entityKind:
        session.kind === 'dimension-endpoint' ? 'dimension' : 'line',
      id: session.id,
      patch,
      guideX: resolved.guideX,
      guideY: resolved.guideY,
      snapX: resolved.snapX,
      snapY: resolved.snapY,
    };
  }
}
