import { normalizePieces } from './pieces';
import {
  normalizeCanvasNotes,
  normalizeDimensions,
  normalizeDrawingLines,
} from '../domain/annotations';
import { normalizeFloorPlan } from '../domain/floor-plans';
import { normalizeProjectScratchpad } from '../domain/scratchpad';
import { normalizeRoomFeatures } from '../domain/room-features';
import { normalizeSlabSurfaces } from '../domain/slabs';
import { clamp } from '../core/numeric';
import type { JsonObject } from '../domain/types';
import { cloneJson, isJsonObject } from '../domain/types';
import type {
  Area,
  Layout,
  Material,
  ProjectMeta,
  ProjectState,
} from '../domain/project';
import { DEFAULT_EDITOR_PREFERENCES } from './defaults';
import type {
  EditorPreferences,
  PersistedEditorState,
  Workspace,
} from './schema';

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

function stableId(prefix: string, index: number, raw: unknown): string {
  const candidate = stringValue(raw).trim();
  return candidate || `migrated-${prefix}-${index + 1}`;
}

export function normalizeMaterial(raw: unknown, index: number): Material {
  const source = isJsonObject(raw) ? raw : {};
  const thickness = finiteNumber(source.thicknessCm, 3);
  const slabW = finiteNumber(source.defaultSlabW, 126);
  const slabH = finiteNumber(source.defaultSlabH, 63);

  return {
    id: stableId('material', index, source.id),
    name: stringValue(source.name).trim() || `Material ${index + 1}`,
    category: stringValue(source.category).trim(),
    manufacturer: stringValue(source.manufacturer).trim(),
    finish: stringValue(source.finish, 'Polished').trim() || 'Polished',
    thicknessCm: clamp(thickness, 0.5, 10),
    defaultSlabW: clamp(slabW, 24, 240),
    defaultSlabH: clamp(slabH, 24, 120),
  };
}

function normalizeAreas(raw: unknown, layoutIndex: number): {
  areas: Area[];
  activeAreaId: string;
} {
  const source = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();

  const areas = source.map((item, index) => {
    const record = isJsonObject(item) ? item : {};
    let id = stableId(`layout-${layoutIndex + 1}-area`, index, record.id);

    if (seen.has(id)) id = `migrated-layout-${layoutIndex + 1}-area-${index + 1}`;
    seen.add(id);

    return {
      id,
      name: stringValue(record.name).trim() || `Area ${index + 1}`,
    };
  });

  if (areas.length === 0) {
    areas.push({
      id: `migrated-layout-${layoutIndex + 1}-area-1`,
      name: 'Area 1',
    });
  }

  return {
    areas,
    activeAreaId: areas[0]?.id ?? `migrated-layout-${layoutIndex + 1}-area-1`,
  };
}

const KNOWN_LAYOUT_KEYS = new Set([
  'id',
  'name',
  'quantity',
  'cw',
  'ch',
  'scale',
  'grid',
  'showGrid',
  'pieceFillOpacity',
  'areas',
  'activeAreaId',
  'pieces',
  'dims',
  'notes',
  'lines',
  'roomFeatures',
  'plan',
  'overlays',
  'extra',
]);

function layoutExtra(source: JsonObject): JsonObject {
  const extra: JsonObject = isJsonObject(source.extra)
    ? cloneJson(source.extra)
    : {};

  Object.entries(source).forEach(([key, value]) => {
    if (!KNOWN_LAYOUT_KEYS.has(key)) extra[key] = cloneJson(value);
  });

  return extra;
}

export function normalizeLayout(raw: unknown, index: number): Layout {
  const source = isJsonObject(raw) ? raw : {};
  const normalizedAreas = normalizeAreas(source.areas, index);
  const requestedActiveAreaId = stringValue(source.activeAreaId).trim();
  const activeAreaId = normalizedAreas.areas.some((area) => area.id === requestedActiveAreaId)
    ? requestedActiveAreaId
    : normalizedAreas.activeAreaId;

  return {
    id: stableId('layout', index, source.id),
    name: stringValue(source.name).trim() || `Layout ${index + 1}`,
    quantity: clamp(Math.round(finiteNumber(source.quantity, 1)), 1, 9999),
    cw: finiteNumber(source.cw, 300),
    ch: finiteNumber(source.ch, 200),
    scale: finiteNumber(source.scale, 6),
    grid: finiteNumber(source.grid, 1),
    showGrid: booleanValue(source.showGrid, true),
    pieceFillOpacity: clamp(finiteNumber(source.pieceFillOpacity, 1), 0, 1),
    areas: normalizedAreas.areas,
    activeAreaId,
    pieces: normalizePieces(source.pieces, normalizedAreas.areas.map(area => area.id), `migrated-layout-${index + 1}-piece`),
    dims: normalizeDimensions(source.dims, `layout-${index + 1}-dimension`),
    notes: normalizeCanvasNotes(source.notes, `layout-${index + 1}-note`),
    lines: normalizeDrawingLines(source.lines, `layout-${index + 1}-line`),
    roomFeatures: normalizeRoomFeatures(
      source.roomFeatures,
      `layout-${index + 1}-room-feature`,
    ),
    plan: normalizeFloorPlan(
      source.plan,
      0,
      `layout-${index + 1}-floor-plan`,
    ),
    overlays: normalizeSlabSurfaces(
      source.overlays,
      `layout-${index + 1}-slab`,
    ),
    extra: layoutExtra(source),
  };
}

export function normalizeProjectMeta(raw: unknown): ProjectMeta {
  const source = isJsonObject(raw) ? raw : {};

  return {
    name: stringValue(source.name),
    date: stringValue(source.date),
    notes: stringValue(source.notes),
    scratchpad: normalizeProjectScratchpad(source.scratchpad),
  };
}

export function normalizeProjectState(raw: unknown): ProjectState {
  const source = isJsonObject(raw) ? raw : {};
  const layouts = Array.isArray(source.layouts)
    ? source.layouts.map((layout, index) => normalizeLayout(layout, index))
    : [];

  if (layouts.length === 0) {
    layouts.push(normalizeLayout({}, 0));
  }

  return {
    meta: normalizeProjectMeta(source.meta),
    materials: Array.isArray(source.materials)
      ? source.materials.map((material, index) => normalizeMaterial(material, index))
      : [],
    layouts,
  };
}

function dimensionPrecision(value: unknown): 1 | 2 | 4 | 8 | 16 {
  const number = Number(value);
  return number === 1 || number === 2 || number === 4 || number === 8 || number === 16
    ? number
    : DEFAULT_EDITOR_PREFERENCES.dimPrecision;
}

export function normalizeEditorPreferences(raw: unknown): EditorPreferences {
  const source = isJsonObject(raw) ? raw : {};
  const defaults = DEFAULT_EDITOR_PREFERENCES;
  const workspaceViews = isJsonObject(source.workspaceViews)
    ? cloneJson(source.workspaceViews)
    : null;

  return {
    gridSnap: booleanValue(source.gridSnap, defaults.gridSnap),
    pieceSnap: booleanValue(source.pieceSnap, defaults.pieceSnap),
    slabCutClearance: clamp(finiteNumber(source.slabCutClearance, defaults.slabCutClearance), 0, 2),
    slabEdgeAllowance: clamp(finiteNumber(source.slabEdgeAllowance, defaults.slabEdgeAllowance), 0, 12),
    defaultSlabW: clamp(finiteNumber(source.defaultSlabW, defaults.defaultSlabW), 24, 240),
    defaultSlabH: clamp(finiteNumber(source.defaultSlabH, defaults.defaultSlabH), 24, 120),
    showGrid: booleanValue(source.showGrid, defaults.showGrid),
    showDims: booleanValue(source.showDims, defaults.showDims),
    showSinkCenterlines: booleanValue(
      source.showSinkCenterlines,
      booleanValue(source.showDims, defaults.showSinkCenterlines),
    ),
    showManualDims: booleanValue(source.showManualDims, defaults.showManualDims),
    showSeams: booleanValue(source.showSeams, defaults.showSeams),
    showEdgeProfiles: booleanValue(source.showEdgeProfiles, defaults.showEdgeProfiles),
    edgeLabelMode: source.edgeLabelMode === 'symbol' ? 'symbol' : 'text',
    showEdgeLegend: booleanValue(source.showEdgeLegend, defaults.showEdgeLegend),
    showPieceFills: booleanValue(source.showPieceFills, defaults.showPieceFills),
    pieceFillOpacity: clamp(finiteNumber(source.pieceFillOpacity, defaults.pieceFillOpacity), 0, 1),
    showSlabMaterial: booleanValue(source.showSlabMaterial, defaults.showSlabMaterial),
    showNotes: booleanValue(source.showNotes, defaults.showNotes),
    showLines: booleanValue(source.showLines, defaults.showLines),
    showLabels: booleanValue(source.showLabels, defaults.showLabels),
    showCutoutLabels: booleanValue(source.showCutoutLabels, defaults.showCutoutLabels),
    showSplashLabels: booleanValue(source.showSplashLabels, defaults.showSplashLabels),
    showSplashDims: booleanValue(source.showSplashDims, defaults.showSplashDims),
    showSplashLabelDims: booleanValue(source.showSplashLabelDims, defaults.showSplashLabelDims),
    showLabelDims: booleanValue(source.showLabelDims, defaults.showLabelDims),
    showRadiusLabels: booleanValue(source.showRadiusLabels, defaults.showRadiusLabels),
    showRoomFeatures: booleanValue(source.showRoomFeatures, defaults.showRoomFeatures),
    roomFeatureOpacity: clamp(finiteNumber(source.roomFeatureOpacity, defaults.roomFeatureOpacity), 0, 1),
    showRoomFeatureLabels: booleanValue(
      source.showRoomFeatureLabels,
      defaults.showRoomFeatureLabels,
    ),
    showRoomCabinets: booleanValue(source.showRoomCabinets, defaults.showRoomCabinets),
    showRoomFillersPanels: booleanValue(
      source.showRoomFillersPanels,
      defaults.showRoomFillersPanels,
    ),
    showRoomAppliances: booleanValue(
      source.showRoomAppliances,
      defaults.showRoomAppliances,
    ),
    showRoomWalls: booleanValue(source.showRoomWalls, defaults.showRoomWalls),
    dimPrecision: dimensionPrecision(source.dimPrecision),
    dimFormat: source.dimFormat === 'decimal' ? 'decimal' : 'fraction',
    workspaceViews,
  };
}

export function normalizeWorkspace(value: unknown): Workspace {
  return value === 'slab' ? 'slab' : 'design';
}

export function normalizePersistedEditorState(
  raw: unknown,
  project: ProjectState,
): PersistedEditorState {
  const source = isJsonObject(raw) ? raw : {};
  const requestedLayoutId = stringValue(source.activeLayoutId).trim();
  const activeLayoutId = project.layouts.some((layout) => layout.id === requestedLayoutId)
    ? requestedLayoutId
    : project.layouts[0]?.id ?? null;

  return {
    activeLayoutId,
    workspace: normalizeWorkspace(source.workspace),
    preferences: normalizeEditorPreferences(source.preferences),
  };
}
