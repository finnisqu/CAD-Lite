import type { JsonObject } from '../domain/types';
import type { ProjectState } from '../domain/project';

export const CAD_LITE_SCHEMA_VERSION = 1 as const;

export type CadLiteSchemaVersion = typeof CAD_LITE_SCHEMA_VERSION;
export type Workspace = 'design' | 'slab';
export type DimensionFormat = 'fraction' | 'decimal';
export type EdgeLabelMode = 'text' | 'symbol';

export interface EditorPreferences {
  gridSnap: boolean;
  slabCutClearance: number;
  slabEdgeAllowance: number;
  defaultSlabW: number;
  defaultSlabH: number;
  showGrid: boolean;
  showDims: boolean;
  showSinkCenterlines: boolean;
  showManualDims: boolean;
  showSeams: boolean;
  showEdgeProfiles: boolean;
  edgeLabelMode: EdgeLabelMode;
  showEdgeLegend: boolean;
  showPieceFills: boolean;
  pieceFillOpacity: number;
  showSlabMaterial: boolean;
  showNotes: boolean;
  showLines: boolean;
  showLabels: boolean;
  showCutoutLabels: boolean;
  showSplashLabels: boolean;
  showSplashDims: boolean;
  showSplashLabelDims: boolean;
  showLabelDims: boolean;
  showRadiusLabels: boolean;
  showRoomFeatures: boolean;
  roomFeatureOpacity: number;
  showRoomFeatureLabels: boolean;
  showRoomCabinets: boolean;
  showRoomFillersPanels: boolean;
  showRoomAppliances: boolean;
  showRoomWalls: boolean;
  dimPrecision: 1 | 2 | 4 | 8 | 16;
  dimFormat: DimensionFormat;
  workspaceViews: JsonObject | null;
}

export interface PersistedEditorState {
  activeLayoutId: string | null;
  workspace: Workspace;
  preferences: EditorPreferences;
}

export interface CadLiteFile {
  schemaVersion: CadLiteSchemaVersion;
  appVersion: string;
  project: ProjectState;
  editor: PersistedEditorState;
}
