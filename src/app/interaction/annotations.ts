import {
  addCanvasNote,
  addDimension,
  addDrawingLine,
} from '../commands/annotations';
import {
  createCanvasNote,
  createDimensionAnnotation,
  createDrawingLine,
  type AnnotationPoint,
} from '../../domain/annotations';
import {
  pieceGeometry,
  piecePose,
  pieceRotatedCornersFromGeometryPose,
} from '../../domain/pieces';
import type { ReadonlyApplicationState } from '../state';
import type {
  ToolHandler,
  ToolHandlerContext,
  ToolPointerInput,
} from './types';

export type AnnotationIdFactory = (prefix: string) => string;

export interface AnnotationSegmentPreview {
  kind: 'annotation-segment';
  tool: 'dimension' | 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function activeLayout(state: ReadonlyApplicationState) {
  if (state.session.workspace !== 'design') return null;
  return (
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null
  );
}

function nearestPieceSnap(
  state: ReadonlyApplicationState,
  point: AnnotationPoint,
): AnnotationPoint | null {
  const layout = activeLayout(state);
  if (!layout || !state.preferences.pieceSnap) return null;

  const tolerance = 8 / Math.max(0.001, Math.abs(layout.scale || 1));
  let best: AnnotationPoint | null = null;
  let bestDistance = tolerance;

  layout.pieces.forEach((piece) => {
    const geometry = pieceGeometry(piece);
    const pose = piecePose(piece, 'design');
    const corners = pieceRotatedCornersFromGeometryPose(geometry, pose);
    const candidates = [
      ...corners,
      ...corners.map((corner, index) => {
        const next = corners[(index + 1) % corners.length] ?? corner;
        return {
          x: (corner.x + next.x) / 2,
          y: (corner.y + next.y) / 2,
        };
      }),
    ];

    candidates.forEach((candidate) => {
      const distance = Math.hypot(
        candidate.x - point.x,
        candidate.y - point.y,
      );
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    });
  });

  return best;
}

function snapPoint(
  context: ToolHandlerContext,
  input: ToolPointerInput,
): AnnotationPoint {
  const raw = { x: input.x, y: input.y };
  if (input.modifiers.alt) return raw;

  const piece = nearestPieceSnap(context.state, raw);
  if (piece) return piece;

  const layout = activeLayout(context.state);
  if (layout && context.state.preferences.gridSnap && layout.grid > 0) {
    return {
      x: Math.round(raw.x / layout.grid) * layout.grid,
      y: Math.round(raw.y / layout.grid) * layout.grid,
    };
  }

  return raw;
}

function constrain(
  start: AnnotationPoint,
  end: AnnotationPoint,
  shift: boolean,
): AnnotationPoint {
  if (!shift) return end;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return dx >= dy
    ? { x: end.x, y: start.y }
    : { x: start.x, y: end.y };
}

function segmentPreview(
  context: ToolHandlerContext,
): AnnotationSegmentPreview | null {
  const raw = context.state.session.interaction.preview;
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (
    record.kind !== 'annotation-segment' ||
    (record.tool !== 'dimension' && record.tool !== 'line') ||
    typeof record.x1 !== 'number' ||
    typeof record.y1 !== 'number' ||
    typeof record.x2 !== 'number' ||
    typeof record.y2 !== 'number'
  ) {
    return null;
  }
  return {
    kind: 'annotation-segment',
    tool: record.tool,
    x1: record.x1,
    y1: record.y1,
    x2: record.x2,
    y2: record.y2,
  };
}

function segmentHandler(
  tool: 'dimension' | 'line',
  createId: AnnotationIdFactory,
): ToolHandler {
  return {
    onPointerDown(context, input) {
      if (input.button !== 0 || !activeLayout(context.state)) return;
      const start = snapPoint(context, input);
      return {
        preview: {
          kind: 'annotation-segment',
          tool,
          x1: start.x,
          y1: start.y,
          x2: start.x,
          y2: start.y,
        },
      };
    },
    onPointerMove(context, input) {
      const preview = segmentPreview(context);
      if (!preview || preview.tool !== tool) return;
      const end = constrain(
        { x: preview.x1, y: preview.y1 },
        snapPoint(context, input),
        input.modifiers.shift,
      );
      return {
        preview: {
          ...preview,
          x2: end.x,
          y2: end.y,
        },
      };
    },
    onPointerUp(context, input) {
      const preview = segmentPreview(context);
      const layout = activeLayout(context.state);
      if (!preview || preview.tool !== tool || !layout) {
        return { preview: null };
      }

      const end = constrain(
        { x: preview.x1, y: preview.y1 },
        snapPoint(context, input),
        input.modifiers.shift,
      );
      const start = { x: preview.x1, y: preview.y1 };
      if (Math.hypot(end.x - start.x, end.y - start.y) < 0.001) {
        return { preview: null };
      }

      const command =
        tool === 'dimension'
          ? addDimension(
              layout.id,
              createDimensionAnnotation(
                createId('dimension'),
                start,
                end,
              ),
            )
          : addDrawingLine(
              layout.id,
              createDrawingLine(
                createId('line'),
                start,
                end,
              ),
            );

      return {
        preview: null,
        commands: [command],
        transactionLabel:
          tool === 'dimension' ? 'Add dimension' : 'Add line',
      };
    },
  };
}

function noteHandler(createId: AnnotationIdFactory): ToolHandler {
  return {
    onPointerDown(context, input) {
      const layout = activeLayout(context.state);
      if (!layout || input.button !== 0) return;
      const point = snapPoint(context, input);
      return {
        commands: [
          addCanvasNote(
            layout.id,
            createCanvasNote(createId('note'), point, 'Note'),
          ),
        ],
        transactionLabel: 'Add note',
      };
    },
  };
}

export function registerAnnotationToolHandlers(
  register: (tool: 'dimension' | 'line' | 'note', handler: ToolHandler) => () => void,
  createId: AnnotationIdFactory,
): Array<() => void> {
  return [
    register('dimension', segmentHandler('dimension', createId)),
    register('line', segmentHandler('line', createId)),
    register('note', noteHandler(createId)),
  ];
}
