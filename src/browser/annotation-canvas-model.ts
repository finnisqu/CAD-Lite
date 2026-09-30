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
  displayStart: Point;
  displayEnd: Point;
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

  return {
    dimensions: layout.dims.map((dimension) => {
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
        displayStart: {
          x: dimension.x1 + nx * offset,
          y: dimension.y1 + ny * offset,
        },
        displayEnd: {
          x: dimension.x2 + nx * offset,
          y: dimension.y2 + ny * offset,
        },
        length: annotationSegmentLength(dimension),
      };
    }),
    lines: layout.lines.map((line) => ({
      ...line,
      selected: selection.kind === 'line' && selection.id === line.id,
    })),
    notes: layout.notes.map((note) => ({
      ...note,
      selected: selection.kind === 'note' && selection.id === note.id,
    })),
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
        dimension.displayStart,
        dimension.displayEnd,
      ) <= lineTolerance
    ) {
      return { kind: 'dimension', id: dimension.id };
    }
  }

  return null;
}
