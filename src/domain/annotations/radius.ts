import { clamp, round3 } from '../../core/numeric';
import { rotateVector, rotatedRectBoundingSize } from '../../geometry';
import type { Layout } from '../project';
import {
  pieceSinkLocalPose,
  sinkReferenceAngle,
  type Piece,
  type PieceSink,
} from '../pieces';
import type { JsonObject } from '../types';
import type { CanvasNote, DrawingLine } from './index';

export type RadiusCorner = 'tl' | 'tr' | 'br' | 'bl';
export type RadiusLabelPlacement = 'outside' | 'inside';

export type RadiusReference =
  | {
      kind: 'piece';
      pieceId: string;
      corner: RadiusCorner;
      autoText: boolean;
      lastTarget: { x: number; y: number } | null;
    }
  | {
      kind: 'sink';
      pieceId: string;
      sinkId: string;
      corner: RadiusCorner;
      autoText: boolean;
      lastTarget: { x: number; y: number } | null;
    };

export interface RadiusTarget {
  x: number;
  y: number;
  outward: { x: number; y: number };
  radius: number;
}

export type RadiusCanvasNote = CanvasNote & {
  annotationType: 'radius';
  radiusRef: RadiusReference;
};

export type RadiusDrawingLine = DrawingLine & {
  annotationType: 'radius';
  radiusRef: RadiusReference;
};

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function cornerValue(value: unknown): RadiusCorner | null {
  return value === 'tl' || value === 'tr' || value === 'br' || value === 'bl'
    ? value
    : null;
}

function pointValue(value: unknown): { x: number; y: number } | null {
  const point = objectValue(value);
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x: round3(x), y: round3(y) }
    : null;
}

export function normalizeRadiusReference(value: unknown): RadiusReference | null {
  const source = objectValue(value);
  const pieceId = typeof source?.pieceId === 'string' ? source.pieceId.trim() : '';
  const corner = cornerValue(source?.corner);
  if (!source || !pieceId || !corner) return null;
  const common = {
    pieceId,
    corner,
    autoText: source.autoText !== false,
    lastTarget: pointValue(source.lastTarget),
  };
  if (source.kind === 'sink') {
    const sinkId = typeof source.sinkId === 'string' ? source.sinkId.trim() : '';
    return sinkId ? { kind: 'sink', sinkId, ...common } : null;
  }
  return { kind: 'piece', ...common };
}

export function radiusReferenceKey(reference: RadiusReference): string {
  return reference.kind === 'sink'
    ? `sink:${reference.pieceId}:${reference.sinkId}:${reference.corner}`
    : `piece:${reference.pieceId}:${reference.corner}`;
}

export function radiusReferenceFromAnnotation(
  annotation: CanvasNote | DrawingLine,
): RadiusReference | null {
  if (annotation.annotationType !== 'radius' && annotation.radiusRef === undefined) {
    return null;
  }
  return normalizeRadiusReference(annotation.radiusRef);
}

function signs(corner: RadiusCorner): { sx: -1 | 1; sy: -1 | 1 } {
  return {
    sx: corner === 'tl' || corner === 'bl' ? -1 : 1,
    sy: corner === 'tl' || corner === 'tr' ? -1 : 1,
  };
}

export function pieceRadiusTarget(
  piece: Piece,
  corner: RadiusCorner,
): RadiusTarget | null {
  const radius = Math.max(0, Number(piece.cornerRadii[corner]) || 0);
  if (radius <= 0) return null;
  const bounds = rotatedRectBoundingSize({
    w: Math.max(0.25, piece.w),
    h: Math.max(0.25, piece.h),
    rotation: piece.rotation,
  });
  const cx = piece.x + bounds.w / 2;
  const cy = piece.y + bounds.h / 2;
  const { sx, sy } = signs(corner);
  const local = {
    x: sx * (piece.w / 2 - radius + radius / Math.SQRT2),
    y: sy * (piece.h / 2 - radius + radius / Math.SQRT2),
  };
  const rotated = rotateVector(local.x, local.y, piece.rotation);
  const outward = rotateVector(
    sx / Math.SQRT2,
    sy / Math.SQRT2,
    piece.rotation,
  );
  return {
    x: round3(cx + rotated.x),
    y: round3(cy + rotated.y),
    outward,
    radius: round3(radius),
  };
}

export function sinkRadiusTarget(
  piece: Piece,
  sink: PieceSink,
  corner: RadiusCorner,
): RadiusTarget | null {
  if (sink.shape === 'oval') return null;
  const radius = Math.max(
    0,
    Math.min(Number(sink.cornerR) || 0, sink.w / 2, sink.h / 2),
  );
  if (radius <= 0) return null;

  const bounds = rotatedRectBoundingSize({
    w: Math.max(0.25, piece.w),
    h: Math.max(0.25, piece.h),
    rotation: piece.rotation,
  });
  const pieceCx = piece.x + bounds.w / 2;
  const pieceCy = piece.y + bounds.h / 2;
  const pose = pieceSinkLocalPose(piece, sink);
  const centerLocal = {
    x: pose.cx - piece.w / 2,
    y: pose.cy - piece.h / 2,
  };
  const centerOffset = rotateVector(centerLocal.x, centerLocal.y, piece.rotation);
  const sinkCx = pieceCx + centerOffset.x;
  const sinkCy = pieceCy + centerOffset.y;

  const { sx, sy } = signs(corner);
  const local = {
    x: sx * (sink.w / 2 - radius + radius / Math.SQRT2),
    y: sy * (sink.h / 2 - radius + radius / Math.SQRT2),
  };
  const angle = piece.rotation + sinkReferenceAngle(sink.side) + sink.rotation;
  const pointOffset = rotateVector(local.x, local.y, angle);
  const outward = rotateVector(sx / Math.SQRT2, sy / Math.SQRT2, angle);
  return {
    x: round3(sinkCx + pointOffset.x),
    y: round3(sinkCy + pointOffset.y),
    outward,
    radius: round3(radius),
  };
}

export function resolveRadiusTarget(
  layout: Layout,
  reference: RadiusReference,
): RadiusTarget | null {
  const piece = layout.pieces.find((candidate) => candidate.id === reference.pieceId);
  if (!piece) return null;
  if (reference.kind === 'piece') {
    return pieceRadiusTarget(piece, reference.corner);
  }
  const sink = piece.sinks.find((candidate) => candidate.id === reference.sinkId);
  return sink ? sinkRadiusTarget(piece, sink, reference.corner) : null;
}

export function radiusLabelPosition(
  layout: Pick<Layout, 'cw' | 'ch'>,
  target: RadiusTarget,
  placement: RadiusLabelPlacement = 'outside',
  distance = 10,
): { x: number; y: number } {
  const sign = placement === 'inside' ? -1 : 1;
  let x = round3(clamp(target.x + target.outward.x * distance * sign, 0, layout.cw));
  let y = round3(clamp(target.y + target.outward.y * distance * sign, 0, layout.ch));
  if (Math.hypot(x - target.x, y - target.y) < 3) {
    x = round3(clamp(target.x - target.outward.x * distance * sign, 0, layout.cw));
    y = round3(clamp(target.y - target.outward.y * distance * sign, 0, layout.ch));
  }
  return { x, y };
}

export function findRadiusNote(
  layout: Pick<Layout, 'notes'>,
  reference: RadiusReference,
): RadiusCanvasNote | null {
  const key = radiusReferenceKey(reference);
  return (layout.notes.find((note) => {
    const candidate = radiusReferenceFromAnnotation(note);
    return candidate && radiusReferenceKey(candidate) === key;
  }) as RadiusCanvasNote | undefined) ?? null;
}

export function synchronizeRadiusAnnotations(
  layout: Layout,
  formatRadius: (radius: number) => string = (radius) => `R${round3(radius)}`,
): Layout {
  const removed = new Set<string>();
  let changed = false;
  const notes = layout.notes.flatMap((note) => {
    const reference = radiusReferenceFromAnnotation(note);
    if (!reference) return [note];
    const target = resolveRadiusTarget(layout, reference);
    if (!target) {
      removed.add(note.id);
      changed = true;
      return [];
    }
    const previous = reference.lastTarget;
    const dx = previous ? target.x - previous.x : 0;
    const dy = previous ? target.y - previous.y : 0;
    const nextReference: RadiusReference = {
      ...reference,
      lastTarget: { x: target.x, y: target.y },
    };
    const next = {
      ...note,
      annotationType: 'radius' as const,
      radiusRef: nextReference,
      x: round3(note.x + dx),
      y: round3(note.y + dy),
      text: reference.autoText ? formatRadius(target.radius) : note.text,
    };
    if (JSON.stringify(next) !== JSON.stringify(note)) changed = true;
    return [next];
  });

  const notesById = new Map(notes.map((note) => [note.id, note]));
  const lines = layout.lines.flatMap((line) => {
    if (line.attachedNoteId && removed.has(line.attachedNoteId)) {
      changed = true;
      return [];
    }
    const note = line.attachedNoteId ? notesById.get(line.attachedNoteId) : undefined;
    const reference = note ? radiusReferenceFromAnnotation(note) : null;
    if (!note || !reference) return [line];
    const target = resolveRadiusTarget(layout, reference);
    if (!target) return [line];
    const oldReference = radiusReferenceFromAnnotation(line);
    const previous = oldReference?.lastTarget ?? reference.lastTarget;
    const dx = previous ? target.x - previous.x : 0;
    const dy = previous ? target.y - previous.y : 0;
    const nextReference: RadiusReference = {
      ...reference,
      lastTarget: { x: target.x, y: target.y },
    };
    const translated = {
      ...line,
      annotationType: 'radius' as const,
      radiusRef: nextReference,
      x1: round3(line.x1 + dx),
      y1: round3(line.y1 + dy),
      x2: round3(line.x2 + dx),
      y2: round3(line.y2 + dy),
    };
    if (translated.attachedEnd === 'end') {
      translated.x1 = target.x;
      translated.y1 = target.y;
    } else {
      translated.x2 = target.x;
      translated.y2 = target.y;
    }
    if (JSON.stringify(translated) !== JSON.stringify(line)) changed = true;
    return [translated];
  });

  return changed ? { ...layout, notes, lines } : layout;
}
