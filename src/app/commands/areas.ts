import {
  assignPieceFamiliesToArea,
  getAreaDeletionPlan,
  hasExactIdOrder,
  type Area,
  type Layout,
} from '../../domain/project';
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

export function addArea(
  layoutId: string,
  area: Area,
): AppCommand {
  return {
    type: 'area.add',
    label: 'Add area',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const layoutIndex = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      const layout = state.project.layouts[layoutIndex];

      if (
        layoutIndex < 0 ||
        !layout ||
        layout.areas.some((candidate) => candidate.id === area.id)
      ) {
        return state;
      }

      const normalizedArea: Area = {
        id: area.id,
        name:
          area.name.trim() ||
          `Area ${layout.areas.length + 1}`,
      };
      const nextLayout: Layout = {
        ...layout,
        areas: [...layout.areas, normalizedArea],
        activeAreaId: normalizedArea.id,
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
        session:
          state.session.activeLayoutId === layoutId
            ? {
                ...state.session,
                selection: {
                  kind: 'area',
                  id: normalizedArea.id,
                },
              }
            : state.session,
      };
    },
  };
}

export function renameArea(
  layoutId: string,
  areaId: string,
  name: string,
): AppCommand {
  const nextName = name.trim();

  return {
    type: 'area.rename',
    label: 'Rename area',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const layoutIndex = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      const layout = state.project.layouts[layoutIndex];
      if (layoutIndex < 0 || !layout) return state;

      const areaIndex = layout.areas.findIndex(
        (area) => area.id === areaId,
      );
      const area = layout.areas[areaIndex];
      if (
        areaIndex < 0 ||
        !area ||
        area.name === nextName
      ) {
        return state;
      }

      const areas = [...layout.areas];
      areas[areaIndex] = { ...area, name: nextName };

      return {
        ...state,
        project: {
          ...state.project,
          layouts: replaceLayout(
            state.project.layouts,
            layoutIndex,
            { ...layout, areas },
          ),
        },
      };
    },
  };
}

export interface SetActiveAreaOptions {
  select?: boolean;
}

export function setActiveArea(
  layoutId: string,
  areaId: string,
  options: SetActiveAreaOptions = {},
): AppCommand {
  return {
    type: 'area.setActive',
    label: 'Select area',
    history: 'skip',
    persistence: 'save',
    reduce(state) {
      const layoutIndex = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      const layout = state.project.layouts[layoutIndex];
      if (
        layoutIndex < 0 ||
        !layout ||
        !layout.areas.some((area) => area.id === areaId)
      ) {
        return state;
      }

      const shouldSelect =
        options.select === true &&
        state.session.activeLayoutId === layoutId;
      const activeChanged = layout.activeAreaId !== areaId;
      const selectionChanged =
        shouldSelect &&
        !(
          state.session.selection.kind === 'area' &&
          state.session.selection.id === areaId
        );

      if (!activeChanged && !selectionChanged) return state;

      return {
        ...state,
        project: activeChanged
          ? {
              ...state.project,
              layouts: replaceLayout(
                state.project.layouts,
                layoutIndex,
                { ...layout, activeAreaId: areaId },
              ),
            }
          : state.project,
        session: selectionChanged
          ? {
              ...state.session,
              selection: { kind: 'area', id: areaId },
            }
          : state.session,
      };
    },
  };
}

export function reorderAreas(
  layoutId: string,
  orderedIds: readonly string[],
): AppCommand {
  return {
    type: 'area.reorder',
    label: 'Reorder areas',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const layoutIndex = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      const layout = state.project.layouts[layoutIndex];
      if (layoutIndex < 0 || !layout) return state;

      const currentIds = layout.areas.map((area) => area.id);
      if (!hasExactIdOrder(currentIds, orderedIds)) return state;
      if (
        currentIds.every(
          (id, index) => id === orderedIds[index],
        )
      ) {
        return state;
      }

      const byId = new Map(
        layout.areas.map((area) => [area.id, area]),
      );
      const areas = orderedIds
        .map((id) => byId.get(id))
        .filter((area): area is Area => area !== undefined);

      return {
        ...state,
        project: {
          ...state.project,
          layouts: replaceLayout(
            state.project.layouts,
            layoutIndex,
            { ...layout, areas },
          ),
        },
      };
    },
  };
}

export function assignPiecesToArea(
  layoutId: string,
  pieceIds: readonly string[],
  areaId: string,
): AppCommand {
  return {
    type: 'area.assignPieces',
    label: 'Move pieces to area',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const layoutIndex = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      const layout = state.project.layouts[layoutIndex];
      if (layoutIndex < 0 || !layout) return state;

      const result = assignPieceFamiliesToArea(
        layout,
        pieceIds,
        areaId,
      );
      if (result.layout === layout) return state;

      return {
        ...state,
        project: {
          ...state.project,
          layouts: replaceLayout(
            state.project.layouts,
            layoutIndex,
            result.layout,
          ),
        },
      };
    },
  };
}

export function deleteArea(
  layoutId: string,
  areaId: string,
  fallbackAreaId?: string,
): AppCommand {
  return {
    type: 'area.delete',
    label: 'Delete area',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const layoutIndex = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      const layout = state.project.layouts[layoutIndex];
      if (layoutIndex < 0 || !layout) return state;

      const plan = getAreaDeletionPlan(
        layout,
        areaId,
        fallbackAreaId,
      );
      if (!plan) return state;

      const previousActiveAreaId = layout.activeAreaId;
      const reassigned = assignPieceFamiliesToArea(
        layout,
        plan.affectedPieceIds,
        plan.fallbackAreaId,
      ).layout;
      const areas = reassigned.areas.filter(
        (area) => area.id !== areaId,
      );
      const activeAreaId =
        previousActiveAreaId === areaId
          ? plan.fallbackAreaId
          : previousActiveAreaId;

      const nextLayout: Layout = {
        ...reassigned,
        areas,
        activeAreaId,
      };
      const replaceSelection =
        state.session.activeLayoutId === layoutId &&
        state.session.selection.kind === 'area' &&
        state.session.selection.id === areaId;

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
        session: replaceSelection
          ? {
              ...state.session,
              selection: {
                kind: 'area',
                id: plan.fallbackAreaId,
              },
            }
          : state.session,
      };
    },
  };
}
