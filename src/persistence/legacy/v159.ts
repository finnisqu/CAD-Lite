import type { JsonObject } from '../../domain/types';
import { cloneJson, isJsonObject } from '../../domain/types';
import type { ProjectState } from '../../domain/project';
import {
  normalizeEditorPreferences,
  normalizeLayout,
  normalizeMaterial,
  normalizeProjectMeta,
  normalizeWorkspace,
} from '../normalize';
import type { CadLiteFile, PersistedEditorState } from '../schema';
import { CAD_LITE_SCHEMA_VERSION } from '../schema';

export const V159_SINK_SIDE_CONVENTION = 'front-v2';

export interface LegacyV159ImportOptions {
  appVersion?: string;
}

function legacyLayouts(source: JsonObject): ProjectState['layouts'] {
  return Array.isArray(source.layouts)
    ? source.layouts.map((layout, index) => normalizeLayout(layout, index))
    : [];
}

function legacyProjectState(source: JsonObject): ProjectState {
  return {
    meta: normalizeProjectMeta(source.project),
    materials: Array.isArray(source.materials)
      ? source.materials.map((material, index) => normalizeMaterial(material, index))
      : [],
    layouts: legacyLayouts(source),
  };
}

function activeLayoutId(source: JsonObject, project: ProjectState): string | null {
  const active = Number(source.active);
  const index = Number.isInteger(active) ? active : 0;
  return project.layouts[index]?.id ?? project.layouts[0]?.id ?? null;
}

function editorFromExportApp(source: JsonObject, project: ProjectState): PersistedEditorState {
  const ui = isJsonObject(source.ui) ? source.ui : {};

  return {
    activeLayoutId: activeLayoutId(source, project),
    workspace: normalizeWorkspace(ui.workspace),
    preferences: normalizeEditorPreferences(ui),
  };
}

const SNAPSHOT_PREFERENCE_KEYS = [
  'gridSnap',
  'slabCutClearance',
  'slabEdgeAllowance',
  'defaultSlabW',
  'defaultSlabH',
  'showGrid',
  'showDims',
  'showSinkCenterlines',
  'showManualDims',
  'showSeams',
  'showEdgeProfiles',
  'edgeLabelMode',
  'showEdgeLegend',
  'showPieceFills',
  'pieceFillOpacity',
  'showSlabMaterial',
  'showNotes',
  'showLines',
  'showLabels',
  'showCutoutLabels',
  'showSplashLabels',
  'showSplashDims',
  'showSplashLabelDims',
  'showLabelDims',
  'showRadiusLabels',
  'showRoomFeatures',
  'roomFeatureOpacity',
  'showRoomFeatureLabels',
  'showRoomCabinets',
  'showRoomFillersPanels',
  'showRoomAppliances',
  'showRoomWalls',
  'workspaceViews',
  'dimPrecision',
  'dimFormat',
] as const;

function editorFromSnapshot(source: JsonObject, project: ProjectState): PersistedEditorState {
  const rawPreferences: JsonObject = {};

  SNAPSHOT_PREFERENCE_KEYS.forEach((key) => {
    const value = source[key];
    if (value !== undefined) rawPreferences[key] = cloneJson(value);
  });

  return {
    activeLayoutId: activeLayoutId(source, project),
    workspace: normalizeWorkspace(source.workspace),
    preferences: normalizeEditorPreferences(rawPreferences),
  };
}

export function looksLikeV159ExportApp(value: unknown): value is JsonObject {
  if (!isJsonObject(value)) return false;
  return Array.isArray(value.layouts) && isJsonObject(value.project) && isJsonObject(value.ui);
}

export function looksLikeV159Snapshot(value: unknown): value is JsonObject {
  if (!isJsonObject(value)) return false;
  return (
    Array.isArray(value.layouts) &&
    isJsonObject(value.project) &&
    !isJsonObject(value.ui) &&
    ('workspace' in value || 'gridSnap' in value || 'selectedIds' in value)
  );
}

export function importV159(
  value: unknown,
  options: LegacyV159ImportOptions = {},
): CadLiteFile {
  if (!looksLikeV159ExportApp(value) && !looksLikeV159Snapshot(value)) {
    throw new Error('Input is not a recognized CAD Lite v1.5.99 project payload.');
  }

  const project = legacyProjectState(value);
  const editor = looksLikeV159ExportApp(value)
    ? editorFromExportApp(value, project)
    : editorFromSnapshot(value, project);

  return {
    schemaVersion: CAD_LITE_SCHEMA_VERSION,
    appVersion: options.appVersion ?? '1.6.0-dev.0',
    project,
    editor,
  };
}
