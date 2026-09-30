import type { Layout } from './types';

export interface EmptyLayoutInput {
  id: string;
  firstAreaId: string;
  name: string;
}

export function createEmptyLayout(input: EmptyLayoutInput): Layout {
  return {
    id: input.id,
    name: input.name.trim() || 'Layout',
    quantity: 1,
    cw: 300,
    ch: 200,
    scale: 6,
    grid: 1,
    showGrid: true,
    pieceFillOpacity: 1,
    areas: [{ id: input.firstAreaId, name: 'Area 1' }],
    activeAreaId: input.firstAreaId,
    pieces: [],
    dims: [],
    notes: [],
    lines: [],
    roomFeatures: [],
    plan: null,
    overlays: [],
    extra: {},
  };
}

export function duplicateLayoutRecord(
  source: Layout,
  id: string,
  name = `${source.name || 'Layout'} Copy`,
): Layout {
  const copy = JSON.parse(JSON.stringify(source)) as Layout;
  copy.id = id;
  copy.name = name.trim() || `${source.name || 'Layout'} Copy`;
  return copy;
}

export function hasExactIdOrder(
  currentIds: readonly string[],
  orderedIds: readonly string[],
): boolean {
  if (currentIds.length !== orderedIds.length) return false;

  const current = new Set(currentIds);
  if (current.size !== currentIds.length) return false;

  const requested = new Set(orderedIds);
  if (requested.size !== orderedIds.length) return false;
  if (requested.size !== current.size) return false;

  return orderedIds.every((id) => current.has(id));
}
