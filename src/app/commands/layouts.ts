import {
  duplicateLayoutRecord,
  hasExactIdOrder,
  type Layout,
} from '../../domain/project';
import { resetActiveInteraction } from '../interaction/state';
import type { Selection } from '../state';
import type { AppCommand } from './types';

export interface AddLayoutOptions {
  activate?: boolean;
  select?: boolean;
}

export function addLayout(
  layout: Layout,
  options: AddLayoutOptions = {},
): AppCommand {
  const activate = options.activate ?? true;
  const select = options.select ?? true;

  return {
    type: 'layout.add',
    label: 'Add layout',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      if (
        state.project.layouts.some(
          (candidate) => candidate.id === layout.id,
        )
      ) {
        return state;
      }

      const layouts = [...state.project.layouts, layout];
      let session = state.session;

      if (activate || select) {
        session = {
          ...state.session,
          activeLayoutId: activate
            ? layout.id
            : state.session.activeLayoutId,
          selection: select
            ? { kind: 'layout', id: layout.id }
            : state.session.selection,
          interaction: activate
            ? resetActiveInteraction(state.session.interaction)
            : state.session.interaction,
          transient: activate ? {} : state.session.transient,
        };
      }

      return {
        ...state,
        project: {
          ...state.project,
          layouts,
        },
        session,
      };
    },
  };
}

export interface DuplicateLayoutOptions extends AddLayoutOptions {
  id: string;
  name?: string;
}

export function duplicateLayout(
  sourceLayoutId: string,
  options: DuplicateLayoutOptions,
): AppCommand {
  return {
    type: 'layout.duplicate',
    label: 'Duplicate layout',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const sourceIndex = state.project.layouts.findIndex(
        (layout) => layout.id === sourceLayoutId,
      );
      const source = state.project.layouts[sourceIndex];

      if (
        sourceIndex < 0 ||
        !source ||
        state.project.layouts.some(
          (layout) => layout.id === options.id,
        )
      ) {
        return state;
      }

      const copy = duplicateLayoutRecord(
        source,
        options.id,
        options.name,
      );
      const layouts = [...state.project.layouts];
      layouts.splice(sourceIndex + 1, 0, copy);

      const activate = options.activate ?? false;
      const select = options.select ?? false;
      let session = state.session;

      if (activate || select) {
        session = {
          ...state.session,
          activeLayoutId: activate
            ? copy.id
            : state.session.activeLayoutId,
          selection: select
            ? { kind: 'layout', id: copy.id }
            : state.session.selection,
          interaction: activate
            ? resetActiveInteraction(state.session.interaction)
            : state.session.interaction,
          transient: activate ? {} : state.session.transient,
        };
      }

      return {
        ...state,
        project: {
          ...state.project,
          layouts,
        },
        session,
      };
    },
  };
}

function fallbackLayout(
  layouts: readonly Layout[],
  deletedIndex: number,
): Layout | null {
  if (layouts.length === 0) return null;
  return (
    layouts[Math.min(deletedIndex, layouts.length - 1)] ??
    layouts[0] ??
    null
  );
}

export function deleteLayout(layoutId: string): AppCommand {
  return {
    type: 'layout.delete',
    label: 'Delete layout',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      if (state.project.layouts.length <= 1) return state;

      const deletedIndex = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      if (deletedIndex < 0) return state;

      const layouts = state.project.layouts.filter(
        (layout) => layout.id !== layoutId,
      );
      const deletingActive =
        state.session.activeLayoutId === layoutId;
      const deletedWasSelected =
        state.session.selection.kind === 'layout' &&
        state.session.selection.id === layoutId;
      const fallback = fallbackLayout(layouts, deletedIndex);

      let session = state.session;

      if (deletingActive && fallback) {
        const selection: Selection = deletedWasSelected
          ? { kind: 'layout', id: fallback.id }
          : { kind: 'none' };

        session = {
          ...state.session,
          activeLayoutId: fallback.id,
          selection,
          interaction: resetActiveInteraction(
            state.session.interaction,
          ),
          transient: {},
        };
      } else if (deletedWasSelected) {
        session = {
          ...state.session,
          selection: { kind: 'none' },
        };
      }

      return {
        ...state,
        project: {
          ...state.project,
          layouts,
        },
        session,
      };
    },
  };
}

export function reorderLayouts(
  orderedIds: readonly string[],
): AppCommand {
  return {
    type: 'layout.reorder',
    label: 'Reorder layouts',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const currentIds = state.project.layouts.map(
        (layout) => layout.id,
      );

      if (!hasExactIdOrder(currentIds, orderedIds)) return state;
      if (
        currentIds.every(
          (id, index) => id === orderedIds[index],
        )
      ) {
        return state;
      }

      const byId = new Map(
        state.project.layouts.map((layout) => [
          layout.id,
          layout,
        ]),
      );
      const layouts = orderedIds
        .map((id) => byId.get(id))
        .filter((layout): layout is Layout => layout !== undefined);

      return {
        ...state,
        project: {
          ...state.project,
          layouts,
        },
      };
    },
  };
}

export function renameLayout(
  layoutId: string,
  name: string,
): AppCommand {
  const nextName = name.trim();

  return {
    type: 'layout.rename',
    label: 'Rename layout',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const index = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      const layout = state.project.layouts[index];
      if (index < 0 || !layout || layout.name === nextName) {
        return state;
      }

      const layouts = [...state.project.layouts];
      layouts[index] = { ...layout, name: nextName };

      return {
        ...state,
        project: {
          ...state.project,
          layouts,
        },
      };
    },
  };
}

export function setLayoutQuantity(
  layoutId: string,
  quantity: number,
): AppCommand {
  const numeric = Math.round(Number(quantity));
  const nextQuantity = Number.isFinite(numeric)
    ? Math.max(1, Math.min(9999, numeric))
    : 1;

  return {
    type: 'layout.setQuantity',
    label: 'Change layout quantity',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const index = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      const layout = state.project.layouts[index];
      if (
        index < 0 ||
        !layout ||
        layout.quantity === nextQuantity
      ) {
        return state;
      }

      const layouts = [...state.project.layouts];
      layouts[index] = {
        ...layout,
        quantity: nextQuantity,
      };

      return {
        ...state,
        project: {
          ...state.project,
          layouts,
        },
      };
    },
  };
}
