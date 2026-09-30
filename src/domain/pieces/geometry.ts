import { clamp } from '../../core/numeric';
import {
  projectPolygon,
  rotatedRectBoundingSize,
  rotateVector,
  type Axis,
  type Point,
  type Projection,
  type Size,
  type XYWHRect,
} from '../../geometry';
import type { Workspace } from '../../persistence';
import type { Layout } from '../project/types';
import { slabSurfaceBounds } from '../slabs';
import { pieceGeometry, piecePose } from './factory';
import type {
  CornerRadii,
  Piece,
  PieceGeometry,
  PiecePose,
} from './types';

export const DEFAULT_SLAB_CANVAS_WIDTH = 150;
export const DEFAULT_SLAB_CANVAS_HEIGHT = 90;
export const SLAB_CONTENT_GUTTER = 2;

export function pieceBoundsFromGeometryPose(
  geometry: PieceGeometry,
  pose: PiecePose,
): XYWHRect {
  const size = rotatedRectBoundingSize({
    w: geometry.width,
    h: geometry.height,
    rotation: pose.rotation,
  });

  return {
    x: pose.x,
    y: pose.y,
    w: size.w,
    h: size.h,
  };
}

export function piecePoseBounds(
  piece: Piece,
  workspace: Workspace,
): XYWHRect {
  return pieceBoundsFromGeometryPose(
    pieceGeometry(piece),
    piecePose(piece, workspace),
  );
}

export function pieceCenterFromGeometryPose(
  geometry: PieceGeometry,
  pose: PiecePose,
): Point {
  const bounds = pieceBoundsFromGeometryPose(geometry, pose);
  return {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2,
  };
}

export function pieceRotatedCornersFromGeometryPose(
  geometry: PieceGeometry,
  pose: PiecePose,
): Point[] {
  const center = pieceCenterFromGeometryPose(geometry, pose);
  const u = rotateVector(1, 0, pose.rotation);
  const v = rotateVector(0, 1, pose.rotation);
  const halfWidth = geometry.width / 2;
  const halfHeight = geometry.height / 2;

  return [
    {
      x: center.x - u.x * halfWidth - v.x * halfHeight,
      y: center.y - u.y * halfWidth - v.y * halfHeight,
    },
    {
      x: center.x + u.x * halfWidth - v.x * halfHeight,
      y: center.y + u.y * halfWidth - v.y * halfHeight,
    },
    {
      x: center.x + u.x * halfWidth + v.x * halfHeight,
      y: center.y + u.y * halfWidth + v.y * halfHeight,
    },
    {
      x: center.x - u.x * halfWidth + v.x * halfHeight,
      y: center.y - u.y * halfWidth + v.y * halfHeight,
    },
  ];
}

export function pieceProjectedSpan(
  geometry: PieceGeometry,
  pose: PiecePose,
  axis: Axis,
): Projection {
  return projectPolygon(
    pieceRotatedCornersFromGeometryPose(geometry, pose),
    axis,
  );
}

function finiteExtra(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function pieceWorkspaceCanvasSize(
  layout: Layout,
  workspace: Workspace,
): Size {
  if (workspace === 'design') {
    return { w: layout.cw, h: layout.ch };
  }

  const pieceExtent = layout.pieces.reduce(
    (extent, piece) => {
      const bounds = piecePoseBounds(piece, 'slab');
      return {
        w: Math.max(
          extent.w,
          bounds.x + bounds.w + SLAB_CONTENT_GUTTER,
        ),
        h: Math.max(
          extent.h,
          bounds.y + bounds.h + SLAB_CONTENT_GUTTER,
        ),
      };
    },
    { w: 0, h: 0 },
  );
  const slabExtent = layout.overlays.reduce(
    (extent, slab) => {
      if (!slab.visible) return extent;
      const bounds = slabSurfaceBounds(slab);
      return {
        w: Math.max(
          extent.w,
          bounds.x + bounds.w + SLAB_CONTENT_GUTTER,
        ),
        h: Math.max(
          extent.h,
          bounds.y + bounds.h + SLAB_CONTENT_GUTTER,
        ),
      };
    },
    { w: 0, h: 0 },
  );

  return {
    w: Math.max(
      DEFAULT_SLAB_CANVAS_WIDTH,
      finiteExtra(layout.extra.slabCW),
      pieceExtent.w,
      slabExtent.w,
    ),
    h: Math.max(
      DEFAULT_SLAB_CANVAS_HEIGHT,
      finiteExtra(layout.extra.slabCH),
      pieceExtent.h,
      slabExtent.h,
    ),
  };
}

export function clampPiecePoseToWorkspace(
  layout: Layout,
  workspace: Workspace,
  geometry: PieceGeometry,
  pose: PiecePose,
): PiecePose {
  const canvas = pieceWorkspaceCanvasSize(layout, workspace);
  const bounds = pieceBoundsFromGeometryPose(geometry, pose);

  return {
    x: clamp(pose.x, 0, Math.max(0, canvas.w - bounds.w)),
    y: clamp(pose.y, 0, Math.max(0, canvas.h - bounds.h)),
    rotation: pose.rotation,
  };
}

export function resizePieceGeometry(
  piece: Piece,
  width: number,
  height: number,
): PieceGeometry {
  const nextWidth = Math.max(0.25, width);
  const nextHeight = Math.max(0.25, height);
  const maximumRadius = Math.min(nextWidth, nextHeight) / 2;
  const current = pieceGeometry(piece);
  const clampRadius = (value: number): number =>
    clamp(value, 0, maximumRadius);

  return {
    kind: 'rectangle',
    width: nextWidth,
    height: nextHeight,
    cornerRadii: {
      tl: clampRadius(current.cornerRadii.tl),
      tr: clampRadius(current.cornerRadii.tr),
      br: clampRadius(current.cornerRadii.br),
      bl: clampRadius(current.cornerRadii.bl),
    },
  };
}

export function clampCornerRadii(
  radii: CornerRadii,
  width: number,
  height: number,
): CornerRadii {
  const maximumRadius = Math.max(0, Math.min(width, height) / 2);
  return {
    tl: clamp(radii.tl, 0, maximumRadius),
    tr: clamp(radii.tr, 0, maximumRadius),
    br: clamp(radii.br, 0, maximumRadius),
    bl: clamp(radii.bl, 0, maximumRadius),
  };
}
