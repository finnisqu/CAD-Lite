import { cloneJson, isJsonObject, type JsonObject } from '../domain/types';
import type { EditorPreferences, Workspace } from './schema';

/**
 * v1.5.99 keeps these visibility/display switches independently for DESIGN and
 * SLAB. Other editor preferences (number format, opacity, edge-label mode, etc.)
 * remain shared.
 */
export const WORKSPACE_VIEW_KEYS = [
  'showGrid',
  'showDims',
  'showSinkCenterlines',
  'showManualDims',
  'showSeams',
  'showEdgeProfiles',
  'showPieceFills',
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
] as const;

export type WorkspaceViewKey = (typeof WORKSPACE_VIEW_KEYS)[number];
export type WorkspaceViewStorageKey = 'layout' | 'slab';

export function workspaceViewStorageKey(
  workspace: Workspace,
): WorkspaceViewStorageKey {
  return workspace === 'slab' ? 'slab' : 'layout';
}

export function captureWorkspaceView(
  preferences: EditorPreferences,
): JsonObject {
  const view: JsonObject = {};
  WORKSPACE_VIEW_KEYS.forEach((key) => {
    view[key] = preferences[key];
  });
  return view;
}

/**
 * Preserve unknown historical view metadata while ensuring both production
 * workspace buckets contain the complete boolean view contract.
 */
export function ensureWorkspaceViews(
  preferences: EditorPreferences,
): JsonObject {
  const views = isJsonObject(preferences.workspaceViews)
    ? cloneJson(preferences.workspaceViews)
    : {};
  const seed = captureWorkspaceView(preferences);

  (['layout', 'slab'] as const).forEach((key) => {
    const source = isJsonObject(views[key]) ? cloneJson(views[key]) : {};
    const view: JsonObject = { ...seed, ...source };
    WORKSPACE_VIEW_KEYS.forEach((viewKey) => {
      view[viewKey] = viewKey in source
        ? Boolean(source[viewKey])
        : Boolean(seed[viewKey]);
    });
    views[key] = view;
  });

  return views;
}

export function workspaceViewPatchTouches(
  patch: Partial<EditorPreferences>,
): boolean {
  return WORKSPACE_VIEW_KEYS.some((key) => key in patch);
}

/** Save the current top-level visibility state into the active workspace. */
export function saveWorkspaceView(
  preferences: EditorPreferences,
  workspace: Workspace,
): EditorPreferences {
  const views = ensureWorkspaceViews(preferences);
  views[workspaceViewStorageKey(workspace)] = captureWorkspaceView(preferences);
  return { ...preferences, workspaceViews: views };
}

function assignWorkspaceBoolean<K extends WorkspaceViewKey>(
  preferences: EditorPreferences,
  key: K,
  value: boolean,
): void {
  preferences[key] = value;
}

/** Restore one workspace's saved visibility state into the active preferences. */
export function loadWorkspaceView(
  preferences: EditorPreferences,
  workspace: Workspace,
): EditorPreferences {
  const views = ensureWorkspaceViews(preferences);
  const saved = views[workspaceViewStorageKey(workspace)];
  const record = isJsonObject(saved) ? saved : {};
  const next: EditorPreferences = { ...preferences, workspaceViews: views };

  WORKSPACE_VIEW_KEYS.forEach((key) => {
    if (key in record) {
      assignWorkspaceBoolean(next, key, Boolean(record[key]));
    }
  });

  return next;
}
