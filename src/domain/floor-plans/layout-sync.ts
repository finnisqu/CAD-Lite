import { round3 } from '../../core/numeric';
import type { Layout } from '../project';
import type { FloorPlan } from './index';

function ceil3(value: number): number {
  return Math.ceil(value * 1000) / 1000;
}

function planCanvasSize(plan: FloorPlan): { w: number; h: number } {
  const radians = (plan.rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return {
    w: Math.max(
      12,
      round3(plan.w * cosine + plan.h * sine + plan.margin * 2),
    ),
    h: Math.max(
      12,
      round3(plan.w * sine + plan.h * cosine + plan.margin * 2),
    ),
  };
}

function rotatedRectCorners(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): Array<{ x: number; y: number }> {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ].map((point) => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    return {
      x: cx + dx * cosine - dy * sine,
      y: cy + dx * sine + dy * cosine,
    };
  });
}

/**
 * Mirrors the frozen v1.5.99 syncCanvasToPlan behavior.
 *
 * The Floor Plan is centered in the Layout canvas. When the canvas size changes,
 * installed drawing entities are translated by the center delta so their visual
 * relationship to the plan is preserved. Fabrication-only slabPlacement poses are
 * intentionally left untouched.
 */
export function syncLayoutCanvasToFloorPlan(
  layout: Layout,
  plan: FloorPlan,
): Layout {
  const planSize = planCanvasSize(plan);
  const oldW = Math.max(12, Number(layout.cw) || planSize.w);
  const oldH = Math.max(12, Number(layout.ch) || planSize.h);
  const oldCx = oldW / 2;
  const oldCy = oldH / 2;

  let drawingHalfW = 0;
  let drawingHalfH = 0;
  let hasDrawing = false;
  const includePoint = (x: unknown, y: unknown): void => {
    const px = Number(x);
    const py = Number(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    hasDrawing = true;
    drawingHalfW = Math.max(drawingHalfW, Math.abs(px - oldCx));
    drawingHalfH = Math.max(drawingHalfH, Math.abs(py - oldCy));
  };

  layout.pieces.forEach((piece) => {
    rotatedRectCorners(
      piece.x,
      piece.y,
      piece.w,
      piece.h,
      piece.rotation,
    ).forEach((point) => includePoint(point.x, point.y));
  });
  layout.dims.forEach((dimension) => {
    includePoint(dimension.x1, dimension.y1);
    includePoint(dimension.x2, dimension.y2);
  });
  layout.lines.forEach((line) => {
    includePoint(line.x1, line.y1);
    includePoint(line.x2, line.y2);
  });
  layout.notes.forEach((note) => includePoint(note.x, note.y));
  layout.roomFeatures.forEach((feature) => {
    rotatedRectCorners(
      feature.x,
      feature.y,
      feature.length,
      feature.depth,
      feature.rotation,
    ).forEach((point) => includePoint(point.x, point.y));
  });

  const pad = hasDrawing ? 1 : 0;
  const width = Math.max(planSize.w, ceil3((drawingHalfW + pad) * 2));
  const height = Math.max(planSize.h, ceil3((drawingHalfH + pad) * 2));
  const dx = width / 2 - oldCx;
  const dy = height / 2 - oldCy;

  if (Math.abs(dx) <= 0.0001 && Math.abs(dy) <= 0.0001) {
    return layout.cw === width && layout.ch === height
      ? layout
      : { ...layout, cw: width, ch: height };
  }

  return {
    ...layout,
    cw: width,
    ch: height,
    pieces: layout.pieces.map((piece) => ({
      ...piece,
      x: round3(piece.x + dx),
      y: round3(piece.y + dy),
    })),
    dims: layout.dims.map((dimension) => ({
      ...dimension,
      x1: round3(dimension.x1 + dx),
      y1: round3(dimension.y1 + dy),
      x2: round3(dimension.x2 + dx),
      y2: round3(dimension.y2 + dy),
    })),
    lines: layout.lines.map((line) => ({
      ...line,
      x1: round3(line.x1 + dx),
      y1: round3(line.y1 + dy),
      x2: round3(line.x2 + dx),
      y2: round3(line.y2 + dy),
    })),
    notes: layout.notes.map((note) => ({
      ...note,
      x: round3(note.x + dx),
      y: round3(note.y + dy),
    })),
    roomFeatures: layout.roomFeatures.map((feature) => ({
      ...feature,
      x: round3(feature.x + dx),
      y: round3(feature.y + dy),
    })),
  };
}
