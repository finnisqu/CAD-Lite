import type { ProjectMeta } from '../../domain/project';
import type { AppCommand } from './types';

export function setProjectMeta(
  patch: Partial<
    Pick<ProjectMeta, 'name' | 'date' | 'notes' | 'scratchpad'>
  >,
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
      if (
        index < 0 ||
        !material ||
        material.name === nextName
      ) {
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
