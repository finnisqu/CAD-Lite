import type { ReadonlyApplicationState } from '../app/state';
import {
  annotationSegmentLength,
  type CanvasNote,
  type DimensionAnnotation,
  type DrawingLine,
} from '../domain/annotations';
import type { Point } from '../geometry';

export interface CanvasDimensionProjection extends DimensionAnnotation {
  selected: boolean;
  displayX1: number;
  displayY1: number;
  displayX2: number;
  displayY2: number;
  length: number;
}

export interface CanvasLineProjection extends DrawingLine {
  selected: boolean;
}

export interface CanvasNoteProjection extends CanvasNote {
  selected: boolean;
}

export interface AnnotationCanvasProjection {
  dimensions: CanvasDimensionProjection[];
  lines: CanvasLineProjection[];
  notes: CanvasNoteProjection[];
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 <= 1e-12) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2),
  );
  return Math.hypot(
    point.x - (a.x + dx * t),
    point.y - (a.y + dy * t),
  );
}

function annotationEditPreview(
  state: ReadonlyApplicationState,
): {
  entityKind: 'dimension' | 'line' | 'note';
  id: string;
  patch: Record<string, unknown>;
} | null {
  const raw = state.session.interaction.preview;
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (
    record.kind !== 'annotation-edit' ||
    (record.entityKind !== 'dimension' &&
      record.entityKind !== 'line' &&
      record.entityKind !== 'note') ||
    typeof record.id !== 'string' ||
    !record.patch ||
    Array.isArray(record.patch) ||
    typeof record.patch !== 'object'
  ) {
    return null;
  }
  return {
    entityKind: record.entityKind,
    id: record.id,
    patch: record.patch as Record<string, unknown>,
  };
}

export function createAnnotationCanvasProjection(
  state: ReadonlyApplicationState,
): AnnotationCanvasProjection {
  const layout = state.project.layouts.find(
    (item) => item.id === state.session.activeLayoutId,
  );
  if (!layout || state.session.workspace !== 'design') {
    return { dimensions: [], lines: [], notes: [] };
  }

  const scale = Math.max(0.001, Math.abs(layout.scale || 1));
  const selection = state.session.selection;
  const edit = annotationEditPreview(state);

  return {
    dimensions: layout.dims
      .filter((dimension) => dimension.visible && state.preferences.showManualDims)
      .map((source) => {
      const dimension =
        edit?.entityKind === 'dimension' && edit.id === source.id
          ? ({ ...source, ...edit.patch } as DimensionAnnotation)
          : source;
      const dx = dimension.x2 - dimension.x1;
      const dy = dimension.y2 - dimension.y1;
      const length = Math.hypot(dx, dy);
      const offset = dimension.offsetPx / scale;
      const nx = length > 1e-9 ? -dy / length : 0;
      const ny = length > 1e-9 ? dx / length : 0;
      return {
        ...dimension,
        selected:
          selection.kind === 'dimension' && selection.id === dimension.id,
        displayX1: dimension.x1 + nx * offset,
        displayY1: dimension.y1 + ny * offset,
        displayX2: dimension.x2 + nx * offset,
        displayY2: dimension.y2 + ny * offset,
        length: annotationSegmentLength(dimension),
      };
    }),
    lines: layout.lines
      .filter((line) => line.visible && state.preferences.showLines)
      .map((source) => {
        let line =
          edit?.entityKind === 'line' && edit.id === source.id
            ? ({ ...source, ...edit.patch } as DrawingLine)
            : source;
        if (edit?.entityKind === 'note') {
          const note = layout.notes.find((item) => item.id === edit.id);
          if (note && line.attachedNoteId === note.id) {
            const x = typeof edit.patch.x === 'number' ? edit.patch.x : note.x;
            const y = typeof edit.patch.y === 'number' ? edit.patch.y : note.y;
            line =
              line.attachedEnd === 'end'
                ? { ...line, x2: x, y2: y }
                : { ...line, x1: x, y1: y };
          }
        }
        return {
          ...line,
          selected: selection.kind === 'line' && selection.id === line.id,
        };
      }),
    notes: layout.notes
      .filter((note) => note.visible && state.preferences.showNotes)
      .map((source) => {
        const note =
          edit?.entityKind === 'note' && edit.id === source.id
            ? ({ ...source, ...edit.patch } as CanvasNote)
            : source;
        return {
          ...note,
          selected: selection.kind === 'note' && selection.id === note.id,
        };
      }),
  };
}

export function hitTestAnnotations(
  projection: AnnotationCanvasProjection,
  point: Point,
  scale: number,
):
  | { kind: 'dimension'; id: string }
  | { kind: 'line'; id: string }
  | { kind: 'note'; id: string }
  | null {
  const unit = 1 / Math.max(0.001, Math.abs(scale || 1));
  const lineTolerance = 7 * unit;
  const noteTolerance = 10 * unit;

  for (let index = projection.notes.length - 1; index >= 0; index -= 1) {
    const note = projection.notes[index];
    if (
      note &&
      Math.abs(point.x - note.x) <= noteTolerance &&
      Math.abs(point.y - note.y) <= noteTolerance
    ) {
      return { kind: 'note', id: note.id };
    }
  }

  for (let index = projection.lines.length - 1; index >= 0; index -= 1) {
    const line = projection.lines[index];
    if (
      line &&
      distanceToSegment(
        point,
        { x: line.x1, y: line.y1 },
        { x: line.x2, y: line.y2 },
      ) <= lineTolerance
    ) {
      return { kind: 'line', id: line.id };
    }
  }

  for (let index = projection.dimensions.length - 1; index >= 0; index -= 1) {
    const dimension = projection.dimensions[index];
    if (
      dimension &&
      distanceToSegment(
        point,
{ x: dimension.displayX1, y: dimension.displayY1 },
        { x: dimension.displayX2, y: dimension.displayY2 },
      ) <= lineTolerance
    ) {
      return { kind: 'dimension', id: dimension.id };
    }
  }

  return null;
}
