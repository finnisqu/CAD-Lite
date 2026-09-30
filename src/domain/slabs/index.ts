import { clamp } from '../../core/numeric';
import { cloneJson, isJsonObject, type JsonObject } from '../types';

export const DEFAULT_SLAB_WIDTH = 126;
export const DEFAULT_SLAB_HEIGHT = 63;
export const MIN_SLAB_DIMENSION = 12;
export const MAX_SLAB_DIMENSION = 480;

export type SlabSurface = JsonObject & {
  id: string;
  name: string;
  slabW: number;
  slabH: number;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
};

export type SlabSurfacePatch = Partial<
  Pick<
    SlabSurface,
    'name' | 'slabW' | 'slabH' | 'x' | 'y' | 'opacity' | 'visible'
  >
>;

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeSlabSurface(
  raw: unknown,
  index = 0,
  idPrefix = 'slab',
): SlabSurface {
  const source = isJsonObject(raw) ? cloneJson(raw) : {};
  const id =
    stringValue(source.id).trim() ||
    `migrated-${idPrefix}-${index + 1}`;
  const name =
    stringValue(source.name).trim() ||
    `Slab ${index + 1}`;

  return {
    ...source,
    id,
    name,
    slabW: clamp(
      finiteNumber(source.slabW, DEFAULT_SLAB_WIDTH),
      MIN_SLAB_DIMENSION,
      MAX_SLAB_DIMENSION,
    ),
    slabH: clamp(
      finiteNumber(source.slabH, DEFAULT_SLAB_HEIGHT),
      MIN_SLAB_DIMENSION,
      MAX_SLAB_DIMENSION,
    ),
    x: finiteNumber(source.x, 0),
    y: finiteNumber(source.y, 0),
    opacity: clamp(finiteNumber(source.opacity, 1), 0.1, 1),
    visible: booleanValue(source.visible, true),
  };
}

export function normalizeSlabSurfaces(
  raw: unknown,
  idPrefix = 'slab',
): SlabSurface[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) =>
    normalizeSlabSurface(item, index, idPrefix),
  );
}

export function createBlankSlabSurface(
  id: string,
  name: string,
  slabW = DEFAULT_SLAB_WIDTH,
  slabH = DEFAULT_SLAB_HEIGHT,
  x = 0,
  y = 0,
): SlabSurface {
  return normalizeSlabSurface(
    {
      id,
      name,
      slabW,
      slabH,
      x,
      y,
      opacity: 1,
      visible: true,
    },
    0,
    'slab',
  );
}

export interface SlabSurfaceBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function slabSurfaceBounds(
  slab: SlabSurface,
): SlabSurfaceBounds {
  return {
    x: slab.x,
    y: slab.y,
    w: slab.slabW,
    h: slab.slabH,
  };
}

export function slabUsableBounds(
  slab: SlabSurface,
  edgeAllowance: number,
): SlabSurfaceBounds {
  const allowance = clamp(
    Number.isFinite(edgeAllowance) ? edgeAllowance : 0,
    0,
    Math.max(0, Math.min(slab.slabW, slab.slabH) / 2),
  );

  return {
    x: slab.x + allowance,
    y: slab.y + allowance,
    w: Math.max(0, slab.slabW - allowance * 2),
    h: Math.max(0, slab.slabH - allowance * 2),
  };
}

export function slabSurfaceImageSource(
  slab: SlabSurface,
): string | null {
  for (const key of ['dataURL', 'url', 'imageUrl', 'src', 'assetUrl']) {
    const value = slab[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}
