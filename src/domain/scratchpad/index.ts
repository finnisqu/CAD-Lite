import { clamp } from '../../core/numeric';
import { isJsonObject } from '../types';

export interface ProjectScratchpad {
  html: string;
  floating: boolean;
  dockHeight: number;
  width: number;
  height: number;
  left: number | null;
  top: number | null;
}

export type ProjectScratchpadPatch = Partial<ProjectScratchpad>;

export const DEFAULT_PROJECT_SCRATCHPAD: Readonly<ProjectScratchpad> =
  Object.freeze({
    html: '',
    floating: false,
    dockHeight: 220,
    width: 360,
    height: 300,
    left: null,
    top: null,
  });

function productionDimension(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? number : fallback;
}

function normalizedPosition(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeProjectScratchpad(raw: unknown): ProjectScratchpad {
  const source = isJsonObject(raw) ? raw : {};
  return {
    html: typeof source.html === 'string' ? source.html : '',
    floating: Boolean(source.floating),
    dockHeight: clamp(
      productionDimension(source.dockHeight, 220),
      150,
      420,
    ),
    width: clamp(productionDimension(source.width, 360), 280, 720),
    height: clamp(productionDimension(source.height, 300), 190, 560),
    left: normalizedPosition(source.left),
    top: normalizedPosition(source.top),
  };
}

export function patchProjectScratchpad(
  scratchpad: ProjectScratchpad,
  patch: ProjectScratchpadPatch,
): ProjectScratchpad {
  return normalizeProjectScratchpad({ ...scratchpad, ...patch });
}

export function sameProjectScratchpad(
  a: ProjectScratchpad,
  b: ProjectScratchpad,
): boolean {
  return (
    a.html === b.html &&
    a.floating === b.floating &&
    a.dockHeight === b.dockHeight &&
    a.width === b.width &&
    a.height === b.height &&
    a.left === b.left &&
    a.top === b.top
  );
}
