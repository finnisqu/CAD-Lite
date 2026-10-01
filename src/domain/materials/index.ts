import { clamp } from '../../core/numeric';
import type { Material } from '../project/types';

export interface CreateProjectMaterialOptions {
  id: string;
  index: number;
  defaultSlabW?: number;
  defaultSlabH?: number;
}

export type MaterialPatch = Partial<Omit<Material, 'id'>>;

export const MATERIAL_DEFAULTS = Object.freeze({
  finish: 'Polished',
  thicknessCm: 3,
  defaultSlabW: 126,
  defaultSlabH: 63,
});

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createProjectMaterial(
  options: CreateProjectMaterialOptions,
): Material {
  const ordinal = Math.max(1, Math.floor(options.index) + 1);
  return {
    id: options.id,
    name: `Material ${ordinal}`,
    category: '',
    manufacturer: '',
    finish: MATERIAL_DEFAULTS.finish,
    thicknessCm: MATERIAL_DEFAULTS.thicknessCm,
    defaultSlabW: clamp(
      finiteNumber(options.defaultSlabW, MATERIAL_DEFAULTS.defaultSlabW),
      24,
      240,
    ),
    defaultSlabH: clamp(
      finiteNumber(options.defaultSlabH, MATERIAL_DEFAULTS.defaultSlabH),
      24,
      120,
    ),
  };
}

export function patchProjectMaterial(
  material: Material,
  patch: MaterialPatch,
): Material {
  return {
    ...material,
    name:
      patch.name === undefined
        ? material.name
        : patch.name.trim() || 'Material',
    category:
      patch.category === undefined
        ? material.category
        : patch.category.trim(),
    manufacturer:
      patch.manufacturer === undefined
        ? material.manufacturer
        : patch.manufacturer.trim(),
    finish:
      patch.finish === undefined
        ? material.finish
        : patch.finish.trim() || MATERIAL_DEFAULTS.finish,
    thicknessCm:
      patch.thicknessCm === undefined
        ? material.thicknessCm
        : clamp(
            finiteNumber(patch.thicknessCm, MATERIAL_DEFAULTS.thicknessCm),
            0.5,
            10,
          ),
    defaultSlabW:
      patch.defaultSlabW === undefined
        ? material.defaultSlabW
        : clamp(
            finiteNumber(patch.defaultSlabW, MATERIAL_DEFAULTS.defaultSlabW),
            24,
            240,
          ),
    defaultSlabH:
      patch.defaultSlabH === undefined
        ? material.defaultSlabH
        : clamp(
            finiteNumber(patch.defaultSlabH, MATERIAL_DEFAULTS.defaultSlabH),
            24,
            120,
          ),
  };
}

export function sameMaterial(a: Material, b: Material): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.category === b.category &&
    a.manufacturer === b.manufacturer &&
    a.finish === b.finish &&
    a.thicknessCm === b.thicknessCm &&
    a.defaultSlabW === b.defaultSlabW &&
    a.defaultSlabH === b.defaultSlabH
  );
}
