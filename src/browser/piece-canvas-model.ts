import type { ReadonlyApplicationState } from '../app/state';
import {
  pieceGeometry,
  piecePose,
  type Piece,
  type PieceGeometry,
  type PiecePose,
} from '../domain/pieces';
import type { Layout } from '../domain/project';
import {
  rotatedRectBoundingSize,
  roundedRectPathCorners,
  type Point,
  type XYWHRect,
} from '../geometry';
import type { Workspace } from '../persistence/schema';

export const DEFAULT_SLAB_CANVAS_WIDTH = 150;
export const DEFAULT_SLAB_CANVAS_HEIGHT = 90;
export const SLAB_CONTENT_GUTTER = 2;

export interface PieceCanvasAppearance {
  fill: string;
  fillOpacity: number | null;
  stroke: string;
}

export interface PieceCanvasItem {
  id: string;
  name: string;
  layer: number;
  sourceIndex: number;
  geometry: PieceGeometry;
  pose: PiecePose;
  bounds: XYWHRect;
  center: Point;
  localRect: XYWHRect;
  renderRotation: number;
  path: string;
  appearance: PieceCanvasAppearance;
}

export interface PieceCanvasProjection {
  layoutId: string | null;
  workspace: Workspace;
  scale: number;
  canvas: {
    width: number;
    height: number;
  };
  pieces: PieceCanvasItem[];
}

export interface PieceCanvasRenderOptions {
  showPieceFills: boolean;
  pieceFillOpacity: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizedRotation(rotation: number): number {
  if (rotation >= 0 && rotation < 360) return rotation;
  return ((rotation % 360) + 360) % 360;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pieceAppearance(
  piece: Piece,
  options: PieceCanvasRenderOptions,
): PieceCanvasAppearance {
  const noFill = piece.noFill || !options.showPieceFills;

  return {
    fill: noFill ? 'none' : piece.color || '#999',
    fillOpacity: noFill
      ? null
      : clamp01(piece.fillOpacity ?? 1) * clamp01(options.pieceFillOpacity),
    stroke: '#000000',
  };
}

/**
 * Read-only geometry-to-render projection for one Piece.
 *
 * The Piece pose origin remains the top-left of its rotated bounding box,
 * matching v1.5.99. The unrotated rectangle is centered inside that box and
 * then rotated around the common center.
 */
export function projectPieceForCanvas(
  piece: Piece,
  workspace: Workspace,
  options: PieceCanvasRenderOptions,
  sourceIndex = 0,
): PieceCanvasItem {
  const geometry = pieceGeometry(piece);
  const pose = piecePose(piece, workspace);
  const size = rotatedRectBoundingSize({
    w: geometry.width,
    h: geometry.height,
    rotation: pose.rotation,
  });
  const bounds = {
    x: pose.x,
    y: pose.y,
    w: size.w,
    h: size.h,
  };
  const center = {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2,
  };
  const localRect = {
    x: center.x - geometry.width / 2,
    y: center.y - geometry.height / 2,
    w: geometry.width,
    h: geometry.height,
  };

  return {
    id: piece.id,
    name: piece.name,
    layer: piece.layer,
    sourceIndex,
    geometry,
    pose,
    bounds,
    center,
    localRect,
    renderRotation: normalizedRotation(pose.rotation),
    path: roundedRectPathCorners(localRect, geometry.cornerRadii),
    appearance: pieceAppearance(piece, options),
  };
}

function slabCanvasSize(
  layout: Layout,
  pieces: readonly PieceCanvasItem[],
): { width: number; height: number } {
  const storedWidth = finiteNumber(layout.extra.slabCW) ?? 0;
  const storedHeight = finiteNumber(layout.extra.slabCH) ?? 0;
  const contentWidth = pieces.reduce(
    (maximum, piece) =>
      Math.max(maximum, piece.bounds.x + piece.bounds.w + SLAB_CONTENT_GUTTER),
    0,
  );
  const contentHeight = pieces.reduce(
    (maximum, piece) =>
      Math.max(maximum, piece.bounds.y + piece.bounds.h + SLAB_CONTENT_GUTTER),
    0,
  );

  return {
    width: Math.max(DEFAULT_SLAB_CANVAS_WIDTH, storedWidth, contentWidth),
    height: Math.max(DEFAULT_SLAB_CANVAS_HEIGHT, storedHeight, contentHeight),
  };
}

export function createPieceCanvasProjection(
  state: ReadonlyApplicationState,
): PieceCanvasProjection {
  const layout =
    state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    ) ?? null;
  const workspace = state.session.workspace;

  if (!layout) {
    return {
      layoutId: null,
      workspace,
      scale: 1,
      canvas: { width: 0, height: 0 },
      pieces: [],
    };
  }

  const options: PieceCanvasRenderOptions = {
    showPieceFills: state.preferences.showPieceFills,
    pieceFillOpacity: layout.pieceFillOpacity,
  };
  const pieces = layout.pieces
    .map((piece, sourceIndex) =>
      projectPieceForCanvas(piece, workspace, options, sourceIndex),
    )
    .sort(
      (a, b) =>
        a.layer - b.layer || a.sourceIndex - b.sourceIndex,
    );

  return {
    layoutId: layout.id,
    workspace,
    scale: layout.scale,
    canvas:
      workspace === 'slab'
        ? slabCanvasSize(layout, pieces)
        : { width: layout.cw, height: layout.ch },
    pieces,
  };
}
