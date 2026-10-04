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
import {
  constrainPointToAxes,
  screenDistanceToWorld,
} from '../../geometry';
import type {
  ToolHandler,
  ToolHandlerContext,
  ToolPointerInput,
} from './types';

export type AnnotationIdFactory = (prefix: string) => string;

export interface AnnotationSnapResult {
  point: AnnotationPoint;
  guideX: number | null;
  guideY: number | null;
  snapped: boolean;
}

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

  const tolerance = screenDistanceToWorld(8, layout.scale);
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

export function resolveAnnotationPointer(
  state: ReadonlyApplicationState,
  input: ToolPointerInput,
): AnnotationSnapResult {
  const raw = { x: input.x, y: input.y };
  if (input.modifiers.alt) {
    return { point: raw, guideX: null, guideY: null, snapped: false };
  }

  const piece = nearestPieceSnap(state, raw);
  if (piece) {
    return {
      point: piece,
      guideX: piece.x,
      guideY: piece.y,
      snapped: true,
    };
  }

  const layout = activeLayout(state);
  if (layout && state.preferences.gridSnap && layout.grid > 0) {
    const point = {
      x: Math.round(raw.x / layout.grid) * layout.grid,
      y: Math.round(raw.y / layout.grid) * layout.grid,
    };
    return {
      point,
      guideX: point.x === raw.x ? null : point.x,
      guideY: point.y === raw.y ? null : point.y,
      snapped: point.x !== raw.x || point.y !== raw.y,
    };
  }

  return { point: raw, guideX: null, guideY: null, snapped: false };
}

function snapPoint(
  context: ToolHandlerContext,
  input: ToolPointerInput,
): AnnotationPoint {
  return resolveAnnotationPointer(context.state, input).point;
}

export function constrainAnnotationPoint(
  start: AnnotationPoint,
  end: AnnotationPoint,
  shift: boolean,
  weakDegrees = 3,
): { point: AnnotationPoint; guideX: number | null; guideY: number | null } {
  const constrained = constrainPointToAxes(
    start,
    end,
    shift,
    weakDegrees,
  );
  return {
    point: constrained.point,
    guideX: constrained.axis === 'vertical' ? start.x : null,
    guideY: constrained.axis === 'horizontal' ? start.y : null,
  };
}

function constrain(
  start: AnnotationPoint,
  end: AnnotationPoint,
  shift: boolean,
): AnnotationPoint {
  return constrainAnnotationPoint(start, end, shift).point;
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
