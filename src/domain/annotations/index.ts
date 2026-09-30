import { clamp, normalizeDegrees, round3 } from '../../core/numeric';
import { cloneJson, isJsonObject, type JsonObject } from '../types';

export type LineStyle = 'solid' | 'dashed';
export type LineCap = 'none' | 'arrow' | 'dot';
export type NoteAlign = 'left' | 'center' | 'right';
export type AttachedLineEnd = 'start' | 'end';

export interface AnnotationPoint {
  x: number;
  y: number;
}

export type DimensionAnnotation = JsonObject & {
  id: string;
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  offsetPx: number;
};

export type DimensionPatch = Partial<
  Pick<DimensionAnnotation, 'name' | 'x1' | 'y1' | 'x2' | 'y2' | 'offsetPx'>
>;

export type DrawingLine = JsonObject & {
  id: string;
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: LineStyle;
  color: string;
  thickness: number;
  startCap: LineCap;
  endCap: LineCap;
  attachedNoteId: string | null;
  attachedEnd: AttachedLineEnd | null;
};

export type DrawingLinePatch = Partial<
  Pick<
    DrawingLine,
    | 'name'
    | 'x1'
    | 'y1'
    | 'x2'
    | 'y2'
    | 'style'
    | 'color'
    | 'thickness'
    | 'startCap'
    | 'endCap'
    | 'attachedNoteId'
    | 'attachedEnd'
  >
>;

export type CanvasNote = JsonObject & {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  bold: boolean | null;
  italic: boolean;
  align: NoteAlign;
  color: string;
  halo: boolean;
  rotation: number;
};

export type CanvasNotePatch = Partial<
  Pick<
    CanvasNote,
    | 'x'
    | 'y'
    | 'text'
    | 'fontSize'
    | 'bold'
    | 'italic'
    | 'align'
    | 'color'
    | 'halo'
    | 'rotation'
  >
>;

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

function idValue(value: unknown, prefix: string, index: number): string {
  const id = stringValue(value).trim();
  return id || `migrated-${prefix}-${index + 1}`;
}

function hexColor(value: unknown, fallback = '#111111'): string {
  const color = stringValue(value).trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function lineStyle(value: unknown): LineStyle {
  return value === 'dashed' ? 'dashed' : 'solid';
}

function lineCap(value: unknown): LineCap {
  return value === 'arrow' || value === 'dot' ? value : 'none';
}

function attachedEnd(value: unknown): AttachedLineEnd | null {
  return value === 'start' || value === 'end' ? value : null;
}

function noteAlign(value: unknown): NoteAlign {
  return value === 'center' || value === 'right' ? value : 'left';
}

export function normalizeDimensionAnnotation(
  raw: unknown,
  index = 0,
  idPrefix = 'dimension',
): DimensionAnnotation {
  const source = isJsonObject(raw) ? cloneJson(raw) : {};
  return {
    ...source,
    id: idValue(source.id, idPrefix, index),
    name:
      stringValue(source.name).trim() ||
      `Dimension ${index + 1}`,
    x1: round3(finiteNumber(source.x1, 0)),
    y1: round3(finiteNumber(source.y1, 0)),
    x2: round3(finiteNumber(source.x2, 0)),
    y2: round3(finiteNumber(source.y2, 0)),
    offsetPx: finiteNumber(source.offsetPx, 0),
  };
}

export function normalizeDimensions(
  raw: unknown,
  idPrefix = 'dimension',
): DimensionAnnotation[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) =>
    normalizeDimensionAnnotation(item, index, idPrefix),
  );
}

export function createDimensionAnnotation(
  id: string,
  start: AnnotationPoint,
  end: AnnotationPoint,
  name = 'Dimension',
): DimensionAnnotation {
  return normalizeDimensionAnnotation({
    id,
    name,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    offsetPx: 0,
  });
}

export function normalizeDrawingLine(
  raw: unknown,
  index = 0,
  idPrefix = 'line',
): DrawingLine {
  const source = isJsonObject(raw) ? cloneJson(raw) : {};
  const noteId = stringValue(source.attachedNoteId).trim();
  return {
    ...source,
    id: idValue(source.id, idPrefix, index),
    name: stringValue(source.name).trim() || `Line ${index + 1}`,
    x1: round3(finiteNumber(source.x1, 0)),
    y1: round3(finiteNumber(source.y1, 0)),
    x2: round3(finiteNumber(source.x2, 0)),
    y2: round3(finiteNumber(source.y2, 0)),
    style: lineStyle(source.style),
    color: hexColor(source.color),
    thickness: clamp(finiteNumber(source.thickness, 2), 0.25, 20),
    startCap: lineCap(source.startCap),
    endCap: lineCap(source.endCap),
    attachedNoteId: noteId || null,
    attachedEnd: noteId ? attachedEnd(source.attachedEnd) ?? 'start' : null,
  };
}

export function normalizeDrawingLines(
  raw: unknown,
  idPrefix = 'line',
): DrawingLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) =>
    normalizeDrawingLine(item, index, idPrefix),
  );
}

export function createDrawingLine(
  id: string,
  start: AnnotationPoint,
  end: AnnotationPoint,
  name = 'Line',
): DrawingLine {
  return normalizeDrawingLine({
    id,
    name,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    style: 'solid',
    color: '#111111',
    thickness: 2,
    startCap: 'none',
    endCap: 'none',
  });
}

export function normalizeCanvasNote(
  raw: unknown,
  index = 0,
  idPrefix = 'note',
): CanvasNote {
  const source = isJsonObject(raw) ? cloneJson(raw) : {};
  return {
    ...source,
    id: idValue(source.id, idPrefix, index),
    x: round3(finiteNumber(source.x, 0)),
    y: round3(finiteNumber(source.y, 0)),
    text: stringValue(source.text, 'Note') || 'Note',
    fontSize: clamp(finiteNumber(source.fontSize, 12), 6, 48),
    bold: typeof source.bold === 'boolean' ? source.bold : null,
    italic: booleanValue(source.italic, false),
    align: noteAlign(source.align),
    color: hexColor(source.color),
    halo: booleanValue(source.halo, false),
    rotation: round3(normalizeDegrees(source.rotation)),
  };
}

export function normalizeCanvasNotes(
  raw: unknown,
  idPrefix = 'note',
): CanvasNote[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) =>
    normalizeCanvasNote(item, index, idPrefix),
  );
}

export function createCanvasNote(
  id: string,
  point: AnnotationPoint,
  text = 'Note',
): CanvasNote {
  return normalizeCanvasNote({
    id,
    x: point.x,
    y: point.y,
    text,
    fontSize: 12,
    bold: false,
    italic: false,
    align: 'left',
    color: '#111111',
    halo: false,
    rotation: 0,
  });
}

export function annotationSegmentLength(
  segment: Pick<DimensionAnnotation, 'x1' | 'y1' | 'x2' | 'y2'>,
): number {
  return Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
}

export function noteLeaderLines(
  noteId: string,
  lines: readonly DrawingLine[],
): DrawingLine[] {
  return lines.filter((line) => line.attachedNoteId === noteId);
}

export function syncNoteLeaderLines(
  note: Pick<CanvasNote, 'id' | 'x' | 'y'>,
  lines: readonly DrawingLine[],
): DrawingLine[] {
  let changed = false;
  const next = lines.map((line) => {
    if (line.attachedNoteId !== note.id) return line;
    if (line.attachedEnd === 'end') {
      if (line.x2 === note.x && line.y2 === note.y) return line;
      changed = true;
      return { ...line, x2: round3(note.x), y2: round3(note.y) };
    }
    if (line.x1 === note.x && line.y1 === note.y && line.attachedEnd === 'start') {
      return line;
    }
    changed = true;
    return {
      ...line,
      attachedEnd: 'start',
      x1: round3(note.x),
      y1: round3(note.y),
    };
  });
  return changed ? next : [...lines];
}

export function createNoteLeaderLine(
  id: string,
  note: Pick<CanvasNote, 'id' | 'x' | 'y'>,
  target: AnnotationPoint,
  name = 'Note Leader',
): DrawingLine {
  return normalizeDrawingLine({
    id,
    name,
    x1: note.x,
    y1: note.y,
    x2: target.x,
    y2: target.y,
    style: 'solid',
    color: '#111111',
    thickness: 2,
    startCap: 'none',
    endCap: 'arrow',
    attachedNoteId: note.id,
    attachedEnd: 'start',
  });
}
