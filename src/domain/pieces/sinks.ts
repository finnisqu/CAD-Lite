import { clamp, normalizeDegrees, round3 } from '../../core/numeric';
import type {
  Piece,
  PieceSink,
  PieceSinkInsideFinish,
  PieceSinkPatch,
  PieceSinkShape,
  PieceSinkSide,
  PieceSinkType,
} from './types';

export const SINK_STANDARD_SETBACK = 3.125;
export const MAX_SINKS_PER_PIECE = 4;
export const DEFAULT_FAUCET_HOLE_DIAMETER = 1.5;
export const DEFAULT_FAUCET_SETBACK = 2.5;
export const DEFAULT_FAUCET_SPACING = 2;

export interface SinkModel {
  id: string;
  label: string;
  shape: PieceSinkShape;
  w: number;
  h: number;
  cornerR: number;
}

export const SINK_MODELS: readonly SinkModel[] = [
  {
    id: 'k3218-single',
    label: 'Kitchen SS 3218',
    shape: 'rect',
    w: 31,
    h: 17,
    cornerR: 4,
  },
  {
    id: 'oval-1714',
    label: 'Oval 1714 Vanity',
    shape: 'oval',
    w: 17,
    h: 14,
    cornerR: 0,
  },
  {
    id: 'rect-1813',
    label: 'Rectangle 1813 Vanity',
    shape: 'rect',
    w: 18,
    h: 13,
    cornerR: 0.25,
  },
];

export interface PieceSinkLocalPose {
  cx: number;
  cy: number;
  angle: number;
  sinkRect: { x: number; y: number; w: number; h: number };
}

export interface SinkFaucetHole {
  index: number;
  x: number;
  y: number;
  radius: number;
}

function validSide(value: unknown): value is PieceSinkSide {
  return (
    value === 'front' ||
    value === 'back' ||
    value === 'left' ||
    value === 'right'
  );
}

function validType(value: unknown): value is PieceSinkType {
  return value === 'model' || value === 'custom';
}

function validFinish(value: unknown): value is PieceSinkInsideFinish {
  return value === 'polished' || value === 'unpolished';
}

function validShape(value: unknown): value is PieceSinkShape {
  return value === 'rect' || value === 'oval';
}

function normalizedFaucets(
  values: readonly number[],
): number[] {
  return [...new Set(
    values
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.round(value))
      .filter((value) => value >= 0 && value <= 8),
  )].sort((a, b) => a - b);
}

export function sinkReferenceAngle(side: PieceSinkSide): number {
  if (side === 'left') return 90;
  if (side === 'back') return 180;
  if (side === 'right') return 270;
  return 0;
}

export function sinkCenterlineMaximum(
  piece: Pick<Piece, 'w' | 'h'>,
  side: PieceSinkSide,
): number {
  return side === 'left' || side === 'right'
    ? Math.max(0, piece.h)
    : Math.max(0, piece.w);
}

export function pieceSinkLocalPose(
  piece: Pick<Piece, 'w' | 'h'>,
  sink: PieceSink,
): PieceSinkLocalPose {
  const side = validSide(sink.side) ? sink.side : 'front';
  const setback = sink.setback ?? SINK_STANDARD_SETBACK;
  let cx: number;
  let cy: number;

  if (sink.fabricationPose) {
    cx = sink.fabricationPose.cx;
    cy = sink.fabricationPose.cy;
  } else if (side === 'front') {
    cx = sink.centerline;
    cy = piece.h - (setback + sink.h / 2);
  } else if (side === 'back') {
    cx = sink.centerline;
    cy = setback + sink.h / 2;
  } else if (side === 'left') {
    cx = setback + sink.h / 2;
    cy = sink.centerline;
  } else {
    cx = piece.w - (setback + sink.h / 2);
    cy = sink.centerline;
  }

  const angle =
    sinkReferenceAngle(side) + sink.rotation;

  return {
    cx,
    cy,
    angle,
    sinkRect: {
      x: cx - sink.w / 2,
      y: cy - sink.h / 2,
      w: sink.w,
      h: sink.h,
    },
  };
}

export function sinkFaucetHoles(
  sink: PieceSink,
): SinkFaucetHole[] {
  return normalizedFaucets(sink.faucets).map((index) => ({
    index,
    x: (-4 + index) * sink.faucetHoleSpacing,
    y: -(sink.h / 2 + sink.faucetSetback),
    radius: sink.faucetHoleDiameter / 2,
  }));
}

export function createDefaultSink(id: string): PieceSink | null {
  const sinkId = id.trim();
  const model = SINK_MODELS[0];
  if (!sinkId || !model) return null;

  return {
    id: sinkId,
    name: '',
    type: 'model',
    modelId: model.id,
    shape: model.shape,
    w: model.w,
    h: model.h,
    cornerR: model.cornerR,
    side: 'front',
    centerline: 20,
    setback: SINK_STANDARD_SETBACK,
    faucets: [4],
    faucetSetback: DEFAULT_FAUCET_SETBACK,
    faucetHoleDiameter: DEFAULT_FAUCET_HOLE_DIAMETER,
    faucetHoleSpacing: DEFAULT_FAUCET_SPACING,
    insideFinish: 'polished',
    rotation: 0,
    fabricationSplitSinkId: null,
    fabricationPose: null,
  };
}

export function applySinkModel(
  sink: PieceSink,
  modelId: string,
): PieceSink {
  const model =
    SINK_MODELS.find((candidate) => candidate.id === modelId) ??
    SINK_MODELS[0];
  if (!model) return sink;

  return {
    ...sink,
    type: 'model',
    modelId: model.id,
    shape: model.shape,
    w: model.w,
    h: model.h,
    cornerR: clamp(model.cornerR, 0, 4),
  };
}

export function updatePieceSink(
  piece: Piece,
  sinkId: string,
  patch: PieceSinkPatch,
): Piece | null {
  const current = piece.sinks.find((sink) => sink.id === sinkId);
  if (!current) return null;

  let next: PieceSink = { ...current };

  if (typeof patch.name === 'string') {
    next.name = patch.name.trim();
  }

  if (validType(patch.type)) {
    next.type = patch.type;
    if (patch.type === 'model') {
      next = applySinkModel(next, next.modelId ?? SINK_MODELS[0]?.id ?? '');
    }
  }

  if (typeof patch.modelId === 'string') {
    next.modelId = patch.modelId;
    if (next.type === 'model') {
      next = applySinkModel(next, patch.modelId);
    }
  }

  if (validShape(patch.shape)) next.shape = patch.shape;
  if (Number.isFinite(patch.w)) {
    next.w = clamp(round3(patch.w as number), 0, 999);
  }
  if (Number.isFinite(patch.h)) {
    next.h = clamp(round3(patch.h as number), 0, 999);
  }
  if (Number.isFinite(patch.cornerR)) {
    next.cornerR = clamp(round3(patch.cornerR as number), 0, 4);
  }

  if (validSide(patch.side)) {
    const changed = patch.side !== next.side;
    next.side = patch.side;
    if (changed) {
      next.centerline = clamp(
        round3(next.centerline),
        0,
        sinkCenterlineMaximum(piece, next.side),
      );
    }
  }

  if (Number.isFinite(patch.centerline)) {
    next.centerline = round3(patch.centerline as number);
  }
  if (Number.isFinite(patch.setback)) {
    next.setback = clamp(round3(patch.setback as number), 0, 999);
  }
  if (Number.isFinite(patch.rotation)) {
    next.rotation = clamp(
      Math.round(patch.rotation as number),
      0,
      360,
    );
  }
  if (Array.isArray(patch.faucets)) {
    next.faucets = normalizedFaucets(patch.faucets);
  }
  if (Number.isFinite(patch.faucetSetback)) {
    next.faucetSetback = Math.max(
      0,
      round3(patch.faucetSetback as number),
    );
  }
  if (Number.isFinite(patch.faucetHoleDiameter)) {
    next.faucetHoleDiameter = Math.max(
      0.001,
      round3(patch.faucetHoleDiameter as number),
    );
  }
  if (Number.isFinite(patch.faucetHoleSpacing)) {
    next.faucetHoleSpacing = Math.max(
      0.001,
      round3(patch.faucetHoleSpacing as number),
    );
  }
  if (validFinish(patch.insideFinish)) {
    next.insideFinish = patch.insideFinish;
  }

  if (JSON.stringify(next) === JSON.stringify(current)) {
    return piece;
  }

  return {
    ...piece,
    sinks: piece.sinks.map((sink) =>
      sink.id === sinkId ? next : sink),
  };
}

export function deletePieceSink(
  piece: Piece,
  sinkId: string,
): Piece | null {
  if (!piece.sinks.some((sink) => sink.id === sinkId)) return null;
  return {
    ...piece,
    sinks: piece.sinks.filter((sink) => sink.id !== sinkId),
  };
}

export function duplicatePieceSink(
  piece: Piece,
  sinkId: string,
  copyId: string,
): Piece | null {
  if (
    piece.sinks.length >= MAX_SINKS_PER_PIECE ||
    !copyId.trim() ||
    piece.sinks.some((sink) => sink.id === copyId)
  ) {
    return null;
  }
  const index = piece.sinks.findIndex((sink) => sink.id === sinkId);
  if (index < 0) return null;
  const source = piece.sinks[index];
  if (!source) return null;

  const copy: PieceSink = {
    ...structuredClone(source),
    id: copyId,
    name: source.name.trim() ? source.name.trim() + ' Copy' : '',
  };
  const sinks = [...piece.sinks];
  sinks.splice(index + 1, 0, copy);
  return { ...piece, sinks };
}

export function mirrorPieceSink(
  piece: Piece,
  source: PieceSink,
  axis: 'h' | 'v',
): PieceSink {
  const sink = structuredClone(source);

  if (axis === 'h') {
    if (sink.side === 'front' || sink.side === 'back') {
      sink.centerline = round3(
        Math.max(0, piece.w - sink.centerline),
      );
    } else {
      sink.side = sink.side === 'left' ? 'right' : 'left';
    }
  } else if (sink.side === 'left' || sink.side === 'right') {
    sink.centerline = round3(
      Math.max(0, piece.h - sink.centerline),
    );
  } else {
    sink.side = sink.side === 'front' ? 'back' : 'front';
  }

  sink.rotation = normalizeDegrees(-sink.rotation);
  sink.faucets = sink.faucets.map((index) => 8 - index).sort((a, b) => a - b);
  return sink;
}
