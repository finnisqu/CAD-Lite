import type { ReadonlyApplicationState } from '../app/state';
import {
  DEFAULT_SLAB_CANVAS_HEIGHT,
  DEFAULT_SLAB_CANVAS_WIDTH,
  SLAB_CONTENT_GUTTER,
  cutoutLabelOffset,
  normalizePieceCutout,
  pieceBoundsFromGeometryPose,
  pieceCenterFromGeometryPose,
  pieceGeometry,
  piecePose,
  pieceSeamLocalCoordinate,
  pieceSinkLocalPose,
  sinkFaucetHoles,
  type Piece,
  type PieceGeometry,
  type PiecePose,
} from '../domain/pieces';
import type { Layout } from '../domain/project';
import {
  slabSurfaceBounds,
  slabSurfaceImageSource,
  slabUsableBounds,
} from '../domain/slabs';
import {
  rotateVector,
  roundedRectContainsPoint,
  roundedRectPathCorners,
  type Point,
  type XYWHRect,
} from '../geometry';
import type { Workspace } from '../persistence/schema';

export {
  DEFAULT_SLAB_CANVAS_HEIGHT,
  DEFAULT_SLAB_CANVAS_WIDTH,
  SLAB_CONTENT_GUTTER,
} from '../domain/pieces';

export interface PieceCanvasAppearance {
  fill: string;
  fillOpacity: number | null;
  stroke: string;
}

export interface PieceCanvasOverride {
  id: string;
  pose?: PiecePose;
  geometry?: PieceGeometry;
}

export interface PieceCanvasCutout {
  id: string;
  name: string;
  kind: 'rectangle' | 'circle' | 'oval';
  center: Point;
  localRotation: number;
  width: number;
  height: number;
  diameter: number | null;
  cornerRadius: number;
  path: string | null;
  polished: boolean;
  split: boolean;
  showLabel: boolean;
  labelOffset: Point;
}

export interface PieceCanvasFaucetHole {
  index: number;
  x: number;
  y: number;
  radius: number;
}

export interface PieceCanvasSink {
  id: string;
  name: string;
  shape: 'rect' | 'oval';
  center: Point;
  localRotation: number;
  width: number;
  height: number;
  cornerRadius: number;
  path: string | null;
  faucets: PieceCanvasFaucetHole[];
  side: 'front' | 'back' | 'left' | 'right';
  centerline: number;
  split: boolean;
  showCenterline: boolean;
}

export interface PieceCanvasSeam {
  id: string;
  kind: 'planning' | 'fabrication';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PieceCanvasItem {
  id: string;
  name: string;
  layer: number;
  sourceIndex: number;
  selected: boolean;
  geometry: PieceGeometry;
  pose: PiecePose;
  bounds: XYWHRect;
  center: Point;
  localRect: XYWHRect;
  renderRotation: number;
  path: string;
  appearance: PieceCanvasAppearance;
  sinks: PieceCanvasSink[];
  cutouts: PieceCanvasCutout[];
  seams: PieceCanvasSeam[];
}

export interface PieceCanvasSlab {
  id: string;
  name: string;
  bounds: XYWHRect;
  usableBounds: XYWHRect;
  opacity: number;
  visible: boolean;
  selected: boolean;
  imageSource: string | null;
}

export interface PieceCanvasProjection {
  layoutId: string | null;
  workspace: Workspace;
  scale: number;
  canvas: {
    width: number;
    height: number;
  };
  slabs: PieceCanvasSlab[];
  pieces: PieceCanvasItem[];
}

export interface PieceCanvasRenderOptions {
  showPieceFills: boolean;
  pieceFillOpacity: number;
  showSeams: boolean;
  showSinkCenterlines: boolean;
  showCutoutLabels: boolean;
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

function projectCutouts(
  piece: Piece,
  geometry: PieceGeometry,
  localRect: XYWHRect,
  showLabels: boolean,
): PieceCanvasCutout[] {
  return piece.cutouts.map((source) => {
    const cutout = normalizePieceCutout(
      source,
      { w: geometry.width, h: geometry.height },
    );
    const width = cutout.w;
    const height = cutout.h;
    const cornerRadius = Math.min(
      Math.max(0, cutout.cornerR),
      width / 2,
      height / 2,
    );
    const rect = {
      x: -width / 2,
      y: -height / 2,
      w: width,
      h: height,
    };
    const minimumSize =
      cutout.kind === 'circle'
        ? cutout.diameter ?? cutout.w
        : Math.min(width, height);

    return {
      id: cutout.id,
      name: cutout.name,
      kind: cutout.kind,
      center: {
        x: localRect.x + cutout.cx,
        y: localRect.y + cutout.cy,
      },
      localRotation:
        cutout.kind === 'circle' ? 0 : cutout.rotation,
      width,
      height,
      diameter: cutout.diameter,
      cornerRadius,
      path:
        cutout.kind === 'rectangle'
          ? roundedRectPathCorners(rect, {
              tl: cornerRadius,
              tr: cornerRadius,
              br: cornerRadius,
              bl: cornerRadius,
            })
          : null,
      polished: cutout.insideFinish === 'polished',
      split: Boolean(cutout.fabricationSplitCutoutId),
      showLabel: showLabels && minimumSize >= 4,
      labelOffset: cutoutLabelOffset(
        cutout,
        { w: geometry.width, h: geometry.height },
      ),
    };
  });
}

function projectSinks(
  piece: Piece,
  geometry: PieceGeometry,
  localRect: XYWHRect,
  showCenterlines: boolean,
): PieceCanvasSink[] {
  return piece.sinks.map((sink) => {
    const pose = pieceSinkLocalPose(
      { w: geometry.width, h: geometry.height },
      sink,
    );
    const width = Math.max(0, sink.w);
    const height = Math.max(0, sink.h);
    const cornerRadius = Math.min(
      Math.max(0, sink.cornerR),
      4,
      width / 2,
      height / 2,
    );
    const rect = {
      x: -width / 2,
      y: -height / 2,
      w: width,
      h: height,
    };
    return {
      id: sink.id,
      name: sink.name,
      shape: sink.shape,
      center: {
        x: localRect.x + pose.cx,
        y: localRect.y + pose.cy,
      },
      localRotation: pose.angle,
      width,
      height,
      cornerRadius,
      path:
        sink.shape === 'oval'
          ? null
          : roundedRectPathCorners(rect, {
              tl: cornerRadius,
              tr: cornerRadius,
              br: cornerRadius,
              bl: cornerRadius,
            }),
      faucets: sinkFaucetHoles(sink),
      side: sink.side,
      centerline: sink.centerline,
      split: Boolean(sink.fabricationSplitSinkId),
      showCenterline:
        showCenterlines && !sink.fabricationSplitSinkId,
    };
  });
}

function projectPlanningSeams(
  piece: Piece,
  geometry: PieceGeometry,
  localRect: XYWHRect,
): PieceCanvasSeam[] {
  return piece.pieceSeams.map((seam) => {
    const coordinate = pieceSeamLocalCoordinate(
      { w: geometry.width, h: geometry.height },
      seam,
    );

    if (seam.orientation === 'horizontal') {
      const y = localRect.y + coordinate;
      return {
        id: seam.id,
        kind: 'planning' as const,
        x1: localRect.x,
        y1: y,
        x2: localRect.x + localRect.w,
        y2: y,
      };
    }

    const x = localRect.x + coordinate;
    return {
      id: seam.id,
      kind: 'planning' as const,
      x1: x,
      y1: localRect.y,
      x2: x,
      y2: localRect.y + localRect.h,
    };
  });
}

function projectFabricationJoints(
  piece: Piece,
  workspace: Workspace,
  localRect: XYWHRect,
): PieceCanvasSeam[] {
  if (workspace !== 'design') return [];

  return piece.assemblyLinks
    .filter((link) =>
      link.kind === 'seam' &&
      Boolean(link.id) &&
      Boolean(link.matePieceId) &&
      piece.id < link.matePieceId)
    .flatMap((link) => {
      const side = link.side;
      if (
        side !== 'top' &&
        side !== 'right' &&
        side !== 'bottom' &&
        side !== 'left'
      ) {
        return [];
      }

      if (side === 'top') {
        return [{
          id: link.id,
          kind: 'fabrication' as const,
          x1: localRect.x,
          y1: localRect.y,
          x2: localRect.x + localRect.w,
          y2: localRect.y,
        }];
      }
      if (side === 'right') {
        return [{
          id: link.id,
          kind: 'fabrication' as const,
          x1: localRect.x + localRect.w,
          y1: localRect.y,
          x2: localRect.x + localRect.w,
          y2: localRect.y + localRect.h,
        }];
      }
      if (side === 'bottom') {
        return [{
          id: link.id,
          kind: 'fabrication' as const,
          x1: localRect.x,
          y1: localRect.y + localRect.h,
          x2: localRect.x + localRect.w,
          y2: localRect.y + localRect.h,
        }];
      }
      return [{
        id: link.id,
        kind: 'fabrication' as const,
        x1: localRect.x,
        y1: localRect.y,
        x2: localRect.x,
        y2: localRect.y + localRect.h,
      }];
    });
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

export function projectPieceForCanvas(
  piece: Piece,
  workspace: Workspace,
  options: PieceCanvasRenderOptions,
  sourceIndex = 0,
  override: PieceCanvasOverride | null = null,
  selected = false,
): PieceCanvasItem {
  const geometry = override?.geometry ?? pieceGeometry(piece);
  const pose = override?.pose ?? piecePose(piece, workspace);
  const bounds = pieceBoundsFromGeometryPose(geometry, pose);
  const center = pieceCenterFromGeometryPose(geometry, pose);
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
    selected,
    geometry,
    pose,
    bounds,
    center,
    localRect,
    renderRotation: normalizedRotation(pose.rotation),
    path: roundedRectPathCorners(localRect, geometry.cornerRadii),
    appearance: pieceAppearance(piece, options),
    sinks: projectSinks(
      piece,
      geometry,
      localRect,
      options.showSinkCenterlines,
    ),
    cutouts: projectCutouts(
      piece,
      geometry,
      localRect,
      options.showCutoutLabels,
    ),
    seams: options.showSeams
      ? [
          ...projectPlanningSeams(piece, geometry, localRect),
          ...projectFabricationJoints(piece, workspace, localRect),
        ]
      : [],
  };
}

function slabCanvasSize(
  layout: Layout,
  pieces: readonly PieceCanvasItem[],
  slabs: readonly PieceCanvasSlab[],
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
  const slabWidth = slabs.reduce(
    (maximum, slab) =>
      slab.visible
        ? Math.max(
            maximum,
            slab.bounds.x + slab.bounds.w + SLAB_CONTENT_GUTTER,
          )
        : maximum,
    0,
  );
  const slabHeight = slabs.reduce(
    (maximum, slab) =>
      slab.visible
        ? Math.max(
            maximum,
            slab.bounds.y + slab.bounds.h + SLAB_CONTENT_GUTTER,
          )
        : maximum,
    0,
  );
  return {
    width: Math.max(
      DEFAULT_SLAB_CANVAS_WIDTH,
      storedWidth,
      contentWidth,
      slabWidth,
    ),
    height: Math.max(
      DEFAULT_SLAB_CANVAS_HEIGHT,
      storedHeight,
      contentHeight,
      slabHeight,
    ),
  };
}

export function createPieceCanvasProjection(
  state: ReadonlyApplicationState,
  overrides: readonly PieceCanvasOverride[] = [],
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
      slabs: [],
      pieces: [],
    };
  }

  const options: PieceCanvasRenderOptions = {
    showPieceFills: state.preferences.showPieceFills,
    pieceFillOpacity: layout.pieceFillOpacity,
    showSeams: state.preferences.showSeams,
    showSinkCenterlines: state.preferences.showSinkCenterlines,
    showCutoutLabels: state.preferences.showCutoutLabels,
  };
  const overrideById = new Map(overrides.map((override) => [override.id, override]));
  const selectedIds = new Set(
    state.session.selection.kind === 'pieces'
      ? state.session.selection.ids
      : [],
  );
  const selectedSlabId =
    state.session.selection.kind === 'slab'
      ? state.session.selection.id
      : null;
  const slabs: PieceCanvasSlab[] =
    workspace === 'slab'
      ? layout.overlays.map((slab) => ({
          id: slab.id,
          name: slab.name,
          bounds: slabSurfaceBounds(slab),
          usableBounds: slabUsableBounds(
            slab,
            state.preferences.slabEdgeAllowance,
          ),
          opacity: slab.opacity,
          visible: slab.visible,
          selected: slab.id === selectedSlabId,
          imageSource: state.preferences.showSlabMaterial
            ? slabSurfaceImageSource(slab)
            : null,
        }))
      : [];

  const pieces = layout.pieces
    .map((piece, sourceIndex) =>
      projectPieceForCanvas(
        piece,
        workspace,
        options,
        sourceIndex,
        overrideById.get(piece.id) ?? null,
        selectedIds.has(piece.id),
      ),
    )
    .sort((a, b) => a.layer - b.layer || a.sourceIndex - b.sourceIndex);

  return {
    layoutId: layout.id,
    workspace,
    scale: layout.scale,
    canvas:
      workspace === 'slab'
        ? slabCanvasSize(layout, pieces, slabs)
        : { width: layout.cw, height: layout.ch },
    slabs,
    pieces,
  };
}

export function hitTestPieceCanvas(
  projection: PieceCanvasProjection,
  point: Point,
): PieceCanvasItem | null {
  for (let index = projection.pieces.length - 1; index >= 0; index -= 1) {
    const piece = projection.pieces[index];
    if (!piece) continue;
    if (
      point.x < piece.bounds.x ||
      point.x > piece.bounds.x + piece.bounds.w ||
      point.y < piece.bounds.y ||
      point.y > piece.bounds.y + piece.bounds.h
    ) {
      continue;
    }

    const offset = rotateVector(
      point.x - piece.center.x,
      point.y - piece.center.y,
      -piece.renderRotation,
    );
    const localPoint = {
      x: piece.center.x + offset.x,
      y: piece.center.y + offset.y,
    };

    if (
      roundedRectContainsPoint(
        piece.localRect,
        piece.geometry.cornerRadii,
        localPoint,
      )
    ) {
      return piece;
    }
  }
  return null;
}


export function hitTestSlabCanvas(
  projection: PieceCanvasProjection,
  point: Point,
): PieceCanvasSlab | null {
  if (projection.workspace !== 'slab') return null;

  for (let index = projection.slabs.length - 1; index >= 0; index -= 1) {
    const slab = projection.slabs[index];
    if (!slab?.visible) continue;
    if (
      point.x >= slab.bounds.x &&
      point.x <= slab.bounds.x + slab.bounds.w &&
      point.y >= slab.bounds.y &&
      point.y <= slab.bounds.y + slab.bounds.h
    ) {
      return slab;
    }
  }
  return null;
}
