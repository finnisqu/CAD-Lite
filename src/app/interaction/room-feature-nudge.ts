import { clamp, round3 } from '../../core/numeric';
import type { RoomFeature } from '../../domain/room-features';
import type { Layout } from '../../domain/project';
import {
  replaceInteractionState,
} from '../commands/session';
import { updateRoomFeature } from '../commands/room-features';
import type { CommandDispatcher } from '../commands/dispatcher';
import type { ReadonlyApplicationState } from '../state';
import type { AppStore } from '../store';

interface RoomFeatureNudgeSession {
  layoutId: string;
  key: string;
  ids: string[];
  dx: number;
  dy: number;
}

function activeDesignLayout(state: ReadonlyApplicationState): Layout | null {
  if (state.session.workspace !== 'design') return null;
  return (
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null
  );
}

function selectedRoomFeatureGroup(
  state: ReadonlyApplicationState,
): { layout: Layout; feature: RoomFeature; ids: string[] } | null {
  const layout = activeDesignLayout(state);
  const selection = state.session.selection;
  if (!layout || selection.kind !== 'roomFeature') return null;
  const feature = layout.roomFeatures.find((item) => item.id === selection.id);
  if (!feature) return null;
  const ids = feature.groupId
    ? layout.roomFeatures
        .filter((item) => item.groupId === feature.groupId)
        .map((item) => item.id)
    : [feature.id];
  return { layout, feature, ids };
}

function rotatedBounds(feature: RoomFeature): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const angle = feature.rotation * Math.PI / 180;
  const width =
    Math.abs(feature.length * Math.cos(angle)) +
    Math.abs(feature.depth * Math.sin(angle));
  const height =
    Math.abs(feature.length * Math.sin(angle)) +
    Math.abs(feature.depth * Math.cos(angle));
  const centerX = feature.x + feature.length / 2;
  const centerY = feature.y + feature.depth / 2;
  return {
    minX: centerX - width / 2,
    minY: centerY - height / 2,
    maxX: centerX + width / 2,
    maxY: centerY + height / 2,
  };
}

function clampedDelta(
  layout: Layout,
  ids: readonly string[],
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  const idSet = new Set(ids);
  const members = layout.roomFeatures.filter((feature) => idSet.has(feature.id));
  if (!members.length) return { dx: 0, dy: 0 };
  const bounds = members.map(rotatedBounds);
  const minX = Math.min(...bounds.map((item) => item.minX));
  const minY = Math.min(...bounds.map((item) => item.minY));
  const maxX = Math.max(...bounds.map((item) => item.maxX));
  const maxY = Math.max(...bounds.map((item) => item.maxY));
  return {
    dx: clamp(dx, -minX, layout.cw - maxX),
    dy: clamp(dy, -minY, layout.ch - maxY),
  };
}

function clearNudgePreview(state: ReadonlyApplicationState) {
  return replaceInteractionState({
    ...state.session.interaction,
    pointer: null,
    preview: null,
  });
}

export class RoomFeatureNudgeController {
  private session: RoomFeatureNudgeSession | null = null;

  constructor(
    private readonly store: AppStore,
    private readonly commands: CommandDispatcher,
  ) {}

  nudgeKeyDown(key: string, shiftKey = false): boolean {
    if (this.store.getState().session.interaction.activeTool) return false;
    if (this.store.getState().session.interaction.pointer) return false;

    let direction: { x: number; y: number };
    if (key === 'ArrowLeft') direction = { x: -1, y: 0 };
    else if (key === 'ArrowRight') direction = { x: 1, y: 0 };
    else if (key === 'ArrowUp') direction = { x: 0, y: -1 };
    else if (key === 'ArrowDown') direction = { x: 0, y: 1 };
    else return false;

    if (this.session && this.session.key !== key) this.commit();

    const state = this.store.getState();
    const selected = selectedRoomFeatureGroup(state);
    if (!selected) return false;

    if (!this.session) {
      this.session = {
        layoutId: selected.layout.id,
        key,
        ids: [...selected.ids],
        dx: 0,
        dy: 0,
      };
    }

    const step = (shiftKey ? 4 : 1) * selected.layout.grid;
    const requested = {
      dx: this.session.dx + direction.x * step,
      dy: this.session.dy + direction.y * step,
    };
    const resolved = clampedDelta(
      selected.layout,
      this.session.ids,
      requested.dx,
      requested.dy,
    );
    this.session.dx = round3(resolved.dx);
    this.session.dy = round3(resolved.dy);

    this.commands.execute(
      replaceInteractionState({
        ...state.session.interaction,
        pointer: null,
        preview: {
          kind: 'room-feature-nudge',
          ids: [...this.session.ids],
          dx: this.session.dx,
          dy: this.session.dy,
        },
      }),
    );
    return true;
  }

  nudgeKeyUp(key: string): boolean {
    if (!this.session || this.session.key !== key) return false;
    return this.commit();
  }

  cancel(): boolean {
    if (!this.session) return false;
    this.session = null;
    return this.commands.execute(clearNudgePreview(this.store.getState())) !== null;
  }

  private commit(): boolean {
    const session = this.session;
    if (!session) return false;
    this.session = null;

    const state = this.store.getState();
    const layout = activeDesignLayout(state);
    if (!layout || layout.id !== session.layoutId) {
      return this.commands.execute(clearNudgePreview(state)) !== null;
    }

    const ids = new Set(session.ids);
    const commands = layout.roomFeatures
      .filter((feature) => ids.has(feature.id))
      .map((feature) =>
        updateRoomFeature(layout.id, feature.id, {
          x: round3(feature.x + session.dx),
          y: round3(feature.y + session.dy),
        }),
      );
    commands.push(clearNudgePreview(state));

    return (
      this.commands.executeTransaction('Nudge room features', commands) !== null
    );
  }
}
