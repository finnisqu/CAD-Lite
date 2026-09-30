import {
  normalizeSlabSurface,
  type SlabSurface,
  type SlabSurfacePatch,
} from '../../domain/slabs';
import type { Layout } from '../../domain/project';
import type { AppCommand } from './types';

function replaceLayout(
  layouts: readonly Layout[],
  index: number,
  layout: Layout,
): Layout[] {
  const next = [...layouts];
  next[index] = layout;
  return next;
}

function slabWorkspaceActive(
  state: Parameters<AppCommand['reduce']>[0],
  layoutId: string,
): boolean {
  return (
    state.session.activeLayoutId === layoutId &&
    state.session.workspace === 'slab'
  );
}

export function addSlabSurface(
  layoutId: string,
  slab: SlabSurface,
): AppCommand {
  return {
    type: 'slab.add',
    label: 'Add slab',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      if (!slabWorkspaceActive(state, layoutId)) return state;
      const layoutIndex = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      const layout = state.project.layouts[layoutIndex];
      if (
        layoutIndex < 0 ||
        !layout ||
        layout.overlays.some((item) => item.id === slab.id)
      ) {
        return state;
      }

      const normalized = normalizeSlabSurface(
        slab,
        layout.overlays.length,
        `${layoutId}-slab`,
      );
      const nextLayout = {
        ...layout,
        overlays: [...layout.overlays, normalized],
      };

      return {
        ...state,
        project: {
          ...state.project,
          layouts: replaceLayout(
            state.project.layouts,
            layoutIndex,
            nextLayout,
          ),
        },
        session: {
          ...state.session,
          selection: { kind: 'slab', id: normalized.id },
        },
      };
    },
  };
}

export function updateSlabSurface(
  layoutId: string,
  slabId: string,
  patch: SlabSurfacePatch,
): AppCommand {
  return {
    type: 'slab.update',
    label: 'Update slab',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      if (!slabWorkspaceActive(state, layoutId)) return state;
      const layoutIndex = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      const layout = state.project.layouts[layoutIndex];
      if (layoutIndex < 0 || !layout) return state;

      const slabIndex = layout.overlays.findIndex(
        (slab) => slab.id === slabId,
      );
      const slab = layout.overlays[slabIndex];
      if (slabIndex < 0 || !slab) return state;

      const nextSlab = normalizeSlabSurface(
        { ...slab, ...patch, id: slab.id },
        slabIndex,
        `${layoutId}-slab`,
      );
      if (JSON.stringify(nextSlab) === JSON.stringify(slab)) {
        return state;
      }

      const overlays = [...layout.overlays];
      overlays[slabIndex] = nextSlab;
      return {
        ...state,
        project: {
          ...state.project,
          layouts: replaceLayout(
            state.project.layouts,
            layoutIndex,
            { ...layout, overlays },
          ),
        },
      };
    },
  };
}

export function deleteSlabSurface(
  layoutId: string,
  slabId: string,
): AppCommand {
  return {
    type: 'slab.delete',
    label: 'Delete slab',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      if (!slabWorkspaceActive(state, layoutId)) return state;
      const layoutIndex = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      const layout = state.project.layouts[layoutIndex];
      if (
        layoutIndex < 0 ||
        !layout ||
        !layout.overlays.some((slab) => slab.id === slabId)
      ) {
        return state;
      }

      const selection =
        state.session.selection.kind === 'slab' &&
        state.session.selection.id === slabId
          ? { kind: 'none' as const }
          : state.session.selection;

      return {
        ...state,
        project: {
          ...state.project,
          layouts: replaceLayout(
            state.project.layouts,
            layoutIndex,
            {
              ...layout,
              overlays: layout.overlays.filter(
                (slab) => slab.id !== slabId,
              ),
            },
          ),
        },
        session: {
          ...state.session,
          selection,
        },
      };
    },
  };
}
