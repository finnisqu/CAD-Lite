import type {
  ApplicationState,
  ReadonlyApplicationState,
} from '../app';

export type ProductionOutputFormat =
  | 'pdf-current'
  | 'pdf-all'
  | 'png'
  | 'svg';

export interface ProductionOutputMetadata {
  projectName: string;
  projectDate: string;
  projectNotes: string;
  layoutId: string;
  layoutName: string;
}

export interface ProductionPdfPlacement {
  orientation: 'landscape' | 'portrait';
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  maxWidth: number;
  maxHeight: number;
}

function filesystemSafeProjectName(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '_') || 'Untitled'
  );
}

function resolvedDate(value: string, fallbackDate: string): string {
  return value.trim() || fallbackDate;
}

export function createProductionOutputMetadata(
  state: ReadonlyApplicationState,
  layoutId: string | null = state.session.activeLayoutId,
  fallbackDate = 'undated',
): ProductionOutputMetadata | null {
  if (!layoutId) return null;
  const layout = state.project.layouts.find((candidate) => candidate.id === layoutId);
  if (!layout) return null;

  return {
    projectName: state.project.meta.name.trim() || 'Untitled',
    projectDate: resolvedDate(state.project.meta.date, fallbackDate),
    projectNotes: state.project.meta.notes.trim(),
    layoutId: layout.id,
    layoutName: layout.name.trim() || 'Layout',
  };
}

export function productionOutputFilename(
  metadata: Pick<ProductionOutputMetadata, 'projectName' | 'projectDate'>,
  format: ProductionOutputFormat,
): string {
  const base =
    filesystemSafeProjectName(metadata.projectName) +
    '_' +
    resolvedDate(metadata.projectDate, 'undated');

  switch (format) {
    case 'pdf-all':
      return base + '_AllLayouts.pdf';
    case 'pdf-current':
      return base + '.pdf';
    case 'png':
      return base + '.png';
    case 'svg':
      return base + '.svg';
  }
}

export function productionOutputStateForLayout(
  state: ReadonlyApplicationState,
  layoutId: string,
): ApplicationState {
  if (!state.project.layouts.some((layout) => layout.id === layoutId)) {
    throw new Error(`Unknown layout: ${layoutId}`);
  }

  return {
    project: state.project,
    preferences: state.preferences,
    session: {
      ...state.session,
      activeLayoutId: layoutId,
      selection: { kind: 'none' },
      transient: {},
    },
  };
}

export function productionPdfPlacement(
  canvasWidth: number,
  canvasHeight: number,
  pageWidth: number,
  pageHeight: number,
  headerHeight = 40,
  margin = 36,
): ProductionPdfPlacement {
  const width = Math.max(1, Number(canvasWidth) || 1);
  const height = Math.max(1, Number(canvasHeight) || 1);
  const maxWidth = Math.max(1, pageWidth - margin * 2);
  const maxHeight = Math.max(1, pageHeight - margin * 2 - headerHeight);
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  const imageWidth = width * scale;
  const imageHeight = height * scale;

  return {
    orientation: width > height ? 'landscape' : 'portrait',
    imageX: margin + (maxWidth - imageWidth) / 2,
    imageY: margin + headerHeight + (maxHeight - imageHeight) / 2,
    imageWidth,
    imageHeight,
    maxWidth,
    maxHeight,
  };
}
