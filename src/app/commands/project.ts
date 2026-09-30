import { clamp } from '../../core/numeric';
import type { ProjectMeta } from '../../domain/project';
import type { AppCommand } from './types';

export function setProjectMeta(
  patch: Partial<Pick<ProjectMeta, 'name' | 'date' | 'notes' | 'scratchpad'>>,
): AppCommand {
  return {
    type: 'project.setMeta',
    label: 'Update project details',
    history: 'skip',
    persistence: 'save',
    reduce(state) {
      const current = state.project.meta;
      const next: ProjectMeta = {
        name: patch.name === undefined ? current.name : patch.name,
        date: patch.date === undefined ? current.date : patch.date,
        notes: patch.notes === undefined ? current.notes : patch.notes,
        scratchpad:
          patch.scratchpad === undefined
            ? current.scratchpad
            : patch.scratchpad,
      };

      if (
        next.name === current.name &&
        next.date === current.date &&
        next.notes === current.notes &&
        next.scratchpad === current.scratchpad
      ) {
        return state;
      }

      return {
        ...state,
        project: {
          ...state.project,
          meta: next,
        },
      };
    },
  };
}

export function renameLayout(layoutId: string, name: string): AppCommand {
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
  const nextQuantity = clamp(
    Math.round(Number(quantity) || 1),
    1,
    9999,
  );

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
      if (index < 0 || !layout || layout.quantity === nextQuantity) {
        return state;
      }

      const layouts = [...state.project.layouts];
      layouts[index] = { ...layout, quantity: nextQuantity };

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
      if (areaIndex < 0 || !area || area.name === nextName) {
        return state;
      }

      const areas = [...layout.areas];
      areas[areaIndex] = { ...area, name: nextName };

      const layouts = [...state.project.layouts];
      layouts[layoutIndex] = { ...layout, areas };

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

export function renameMaterial(
  materialId: string,
  name: string,
): AppCommand {
  const nextName = name.trim();

  return {
    type: 'material.rename',
    label: 'Rename material',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const index = state.project.materials.findIndex(
        (material) => material.id === materialId,
      );
      const material = state.project.materials[index];
      if (index < 0 || !material || material.name === nextName) {
        return state;
      }

      const materials = [...state.project.materials];
      materials[index] = { ...material, name: nextName };

      return {
        ...state,
        project: {
          ...state.project,
          materials,
        },
      };
    },
  };
}
