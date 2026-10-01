import type { Material } from '../../domain/project';
import {
  createProjectMaterial,
  patchProjectMaterial,
  sameMaterial,
  type MaterialPatch,
} from '../../domain/materials';
import type { AppCommand } from './types';

export function addMaterial(materialId: string): AppCommand {
  return {
    type: 'material.add',
    label: 'Add material',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      if (state.project.materials.some((item) => item.id === materialId)) {
        return state;
      }

      const material = createProjectMaterial({
        id: materialId,
        index: state.project.materials.length,
        defaultSlabW: state.preferences.defaultSlabW,
        defaultSlabH: state.preferences.defaultSlabH,
      });

      return {
        ...state,
        project: {
          ...state.project,
          materials: [...state.project.materials, material],
        },
        session: {
          ...state.session,
          selection: { kind: 'material', id: material.id },
        },
      };
    },
  };
}

export function updateMaterial(
  materialId: string,
  patch: MaterialPatch,
): AppCommand {
  return {
    type: 'material.update',
    label: 'Update material',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const index = state.project.materials.findIndex(
        (item) => item.id === materialId,
      );
      const current = state.project.materials[index];
      if (index < 0 || !current) return state;

      const next = patchProjectMaterial(current, patch);
      if (sameMaterial(current, next)) return state;

      const materials = [...state.project.materials];
      materials[index] = next;
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

export function deleteMaterial(materialId: string): AppCommand {
  return {
    type: 'material.delete',
    label: 'Delete material',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const index = state.project.materials.findIndex(
        (item) => item.id === materialId,
      );
      if (index < 0) return state;

      const materials = state.project.materials.filter(
        (item) => item.id !== materialId,
      );
      const next: Material | null =
        materials[
          Math.min(Math.max(index, 0), Math.max(0, materials.length - 1))
        ] ?? null;

      return {
        ...state,
        project: {
          ...state.project,
          materials,
        },
        session: {
          ...state.session,
          selection: next
            ? { kind: 'material', id: next.id }
            : { kind: 'materialCollection' },
        },
      };
    },
  };
}
