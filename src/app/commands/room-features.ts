import {
  normalizeRoomFeature,
  type RoomFeature,
  type RoomFeaturePatch,
} from '../../domain/room-features';
import type { Layout } from '../../domain/project';
import type { ReadonlyApplicationState, Selection } from '../state';
import type { AppCommand } from './types';

function designLayout(
  state: ReadonlyApplicationState,
  layoutId: string,
): { layout: Layout; index: number } | null {
  if (
    state.session.workspace !== 'design' ||
    state.session.activeLayoutId !== layoutId
  ) {
    return null;
  }

  const index = state.project.layouts.findIndex(
    (layout) => layout.id === layoutId,
  );
  const layout = state.project.layouts[index];
  return index >= 0 && layout ? { layout, index } : null;
}

function replace(
  state: ReadonlyApplicationState,
  index: number,
  layout: Layout,
  selection: Selection = state.session.selection,
) {
  const layouts = [...state.project.layouts];
  layouts[index] = layout;
  return {
    ...state,
    project: { ...state.project, layouts },
    session: { ...state.session, selection },
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function addRoomFeature(
  layoutId: string,
  feature: RoomFeature,
): AppCommand {
  return {
    type: 'roomFeature.add',
    label: 'Add room feature',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (
        !target ||
        target.layout.roomFeatures.some((item) => item.id === feature.id)
      ) {
        return state;
      }

      const next = normalizeRoomFeature(
        feature,
        target.layout.roomFeatures.length,
        `${layoutId}-room-feature`,
      );

      return replace(
        state,
        target.index,
        {
          ...target.layout,
          roomFeatures: [...target.layout.roomFeatures, next],
        },
        { kind: 'roomFeature', id: next.id },
      );
    },
  };
}

export function updateRoomFeature(
  layoutId: string,
  id: string,
  patch: RoomFeaturePatch,
): AppCommand {
  return {
    type: 'roomFeature.update',
    label: 'Update room feature',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (!target) return state;

      const index = target.layout.roomFeatures.findIndex(
        (item) => item.id === id,
      );
      const current = target.layout.roomFeatures[index];
      if (index < 0 || !current) return state;

      const next = normalizeRoomFeature(
        { ...current, ...patch, id: current.id },
        index,
        `${layoutId}-room-feature`,
      );
      if (sameJson(current, next)) return state;

      const roomFeatures = [...target.layout.roomFeatures];
      roomFeatures[index] = next;
      return replace(state, target.index, {
        ...target.layout,
        roomFeatures,
      });
    },
  };
}

export function deleteRoomFeature(
  layoutId: string,
  id: string,
): AppCommand {
  return {
    type: 'roomFeature.delete',
    label: 'Delete room feature',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (
        !target ||
        !target.layout.roomFeatures.some((item) => item.id === id)
      ) {
        return state;
      }

      const selection =
        state.session.selection.kind === 'roomFeature' &&
        state.session.selection.id === id
          ? ({ kind: 'none' } as const)
          : state.session.selection;

      return replace(
        state,
        target.index,
        {
          ...target.layout,
          roomFeatures: target.layout.roomFeatures.filter(
            (item) => item.id !== id,
          ),
        },
        selection,
      );
    },
  };
}
