import { clamp, normalizeDegrees, round3 } from '../../core/numeric';
import { rotateVector, rotatedRectBoundingSize } from '../../geometry';
import type { Layout } from '../project/types';
import { isBacksplashPiece } from './relationships';
import type { Piece, PieceSide } from './types';

export const DEFAULT_SPLASH_HEIGHT = 4;
export const MIN_SPLASH_HEIGHT = 0.25;
export const MAX_SPLASH_HEIGHT = 24;
export const DEFAULT_SPLASH_OFFSET = 0;
export const MAX_SPLASH_OFFSET = 1;

export interface LinkedSplashOptions {
  height?: number;
  offset?: number;
}

export interface LinkedSplashPlacement {
  edge: PieceSide;
  length: number;
  height: number;
  offset: number;
  x: number;
  y: number;
  rotation: number;
}

export function normalizeSplashHeight(
  value: unknown,
  fallback = DEFAULT_SPLASH_HEIGHT,
): number {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : fallback;
  return round3(clamp(safe, MIN_SPLASH_HEIGHT, MAX_SPLASH_HEIGHT));
}

export function normalizeSplashOffset(
  value: unknown,
  fallback = DEFAULT_SPLASH_OFFSET,
): number {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : fallback;
  return round3(clamp(safe, DEFAULT_SPLASH_OFFSET, MAX_SPLASH_OFFSET));
}

export function splashContactEdge(sourceEdge: PieceSide): PieceSide {
  if (sourceEdge === 'top' || sourceEdge === 'right') return 'bottom';
  return 'top';
}

export function linkedSplashForEdge(
  pieces: readonly Piece[],
  parentPieceId: string,
  edge: PieceSide,
): Piece | null {
  return pieces.find((piece) =>
    isBacksplashPiece(piece) &&
    piece.attachment?.kind === 'backsplash' &&
    piece.attachment.parentPieceId === parentPieceId &&
    piece.attachment.sourceEdge === edge,
  ) ?? null;
}

export function linkedSplashPlacement(
  parent: Piece,
  edge: PieceSide,
  heightInput = DEFAULT_SPLASH_HEIGHT,
  offsetInput = DEFAULT_SPLASH_OFFSET,
): LinkedSplashPlacement {
  const height = normalizeSplashHeight(heightInput);
  const offset = normalizeSplashOffset(offsetInput);
  const parentSize = rotatedRectBoundingSize({
    w: Math.max(MIN_SPLASH_HEIGHT, parent.w),
    h: Math.max(MIN_SPLASH_HEIGHT, parent.h),
    rotation: parent.rotation,
  });
  const cx = parent.x + parentSize.w / 2;
  const cy = parent.y + parentSize.h / 2;
  const w = Math.max(MIN_SPLASH_HEIGHT, parent.w);
  const h = Math.max(MIN_SPLASH_HEIGHT, parent.h);
  const rotation = normalizeDegrees(parent.rotation);

  const edgeInfo = {
    top: {
      ex: 0,
      ey: -h / 2,
      nx: 0,
      ny: -1,
      length: w,
      rotation,
    },
    right: {
      ex: w / 2,
      ey: 0,
      nx: 1,
      ny: 0,
      length: h,
      rotation: normalizeDegrees(rotation + 90),
    },
    bottom: {
      ex: 0,
      ey: h / 2,
      nx: 0,
      ny: 1,
      length: w,
      rotation,
    },
    left: {
      ex: -w / 2,
      ey: 0,
      nx: -1,
      ny: 0,
      length: h,
      rotation: normalizeDegrees(rotation + 90),
    },
  }[edge];

  const edgeVector = rotateVector(edgeInfo.ex, edgeInfo.ey, rotation);
  const normal = rotateVector(edgeInfo.nx, edgeInfo.ny, rotation);
  const center = {
    x: cx + edgeVector.x + normal.x * (offset + height / 2),
    y: cy + edgeVector.y + normal.y * (offset + height / 2),
  };
  const splashSize = rotatedRectBoundingSize({
    w: edgeInfo.length,
    h: height,
    rotation: edgeInfo.rotation,
  });

  return {
    edge,
    length: round3(edgeInfo.length),
    height,
    offset,
    x: round3(center.x - splashSize.w / 2),
    y: round3(center.y - splashSize.h / 2),
    rotation: round3(edgeInfo.rotation),
  };
}

export function splashPlacementFitsLayout(
  layout: Layout,
  placement: LinkedSplashPlacement,
): boolean {
  const size = rotatedRectBoundingSize({
    w: placement.length,
    h: placement.height,
    rotation: placement.rotation,
  });
  return (
    placement.x >= -0.001 &&
    placement.y >= -0.001 &&
    placement.x + size.w <= layout.cw + 0.001 &&
    placement.y + size.h <= layout.ch + 0.001
  );
}

function clampedSplashPose(
  layout: Layout,
  placement: LinkedSplashPlacement,
): { x: number; y: number; rotation: number; snapped: boolean } {
  const size = rotatedRectBoundingSize({
    w: placement.length,
    h: placement.height,
    rotation: placement.rotation,
  });
  const x = round3(clamp(placement.x, 0, Math.max(0, layout.cw - size.w)));
  const y = round3(clamp(placement.y, 0, Math.max(0, layout.ch - size.h)));
  return {
    x,
    y,
    rotation: placement.rotation,
    snapped: Math.hypot(x - placement.x, y - placement.y) <= 0.05,
  };
}

export function createLinkedSplashPiece(
  layout: Layout,
  parent: Piece,
  id: string,
  edge: PieceSide,
  options: LinkedSplashOptions = {},
): Piece | null {
  if (
    !id.trim() ||
    layout.pieces.some((piece) => piece.id === id) ||
    isBacksplashPiece(parent) ||
    !layout.pieces.some((piece) => piece.id === parent.id) ||
    linkedSplashForEdge(layout.pieces, parent.id, edge)
  ) {
    return null;
  }

  const placement = linkedSplashPlacement(
    parent,
    edge,
    normalizeSplashHeight(options.height),
    normalizeSplashOffset(options.offset),
  );
  const pose = clampedSplashPose(layout, placement);
  const contact = splashContactEdge(edge);
  const edgeProfiles: Piece['edgeProfiles'] = {
    top: 'none',
    right: 'none',
    bottom: 'none',
    left: 'none',
  };
  if ((parent.edgeProfiles[edge] ?? '').trim() === 'miter') {
    edgeProfiles[contact] = 'miter';
  }

  return {
    id,
    name: 'Splash',
    x: pose.x,
    y: pose.y,
    w: placement.length,
    h: placement.height,
    rotation: pose.rotation,
    layer: Math.max(0, ...layout.pieces.map((piece) => piece.layer)) + 1,
    areaId: parent.areaId,
    pieceGroupId: null,
    pieceGroupName: null,
    pieceType: 'backsplash',
    tags: ['backsplash'],
    attachment: {
      kind: 'backsplash',
      parentPieceId: parent.id,
      sourceEdge: edge,
      linkedLength: true,
      snapped: pose.snapped,
      offset: placement.offset,
    },
    assemblyLinks: [],
    slabPlacement: {
      x: pose.x,
      y: pose.y,
      rotation: pose.rotation,
    },
    cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 },
    overhangs: { front: 0, back: 0, left: 0, right: 0 },
    edgeProfiles,
    sinks: [],
    cutouts: [],
    pieceSeams: [],
    color: parent.color || '#ffffff',
    noFill: parent.noFill,
    fillOpacity: parent.fillOpacity,
    splashKind: 'splash',
    splashHeight: placement.height,
    legacy: {},
  };
}

export function insertLinkedSplashAfterFamily(
  pieces: readonly Piece[],
  parentId: string,
  splash: Piece,
): Piece[] {
  const next = [...pieces];
  const parentIndex = next.findIndex((piece) => piece.id === parentId);
  let insertAt = parentIndex >= 0 ? parentIndex + 1 : next.length;
  while (
    insertAt < next.length &&
    next[insertAt]?.attachment?.kind === 'backsplash' &&
    next[insertAt]?.attachment?.parentPieceId === parentId
  ) {
    insertAt += 1;
  }
  next.splice(insertAt, 0, splash);
  return next;
}

export function removeLinkedSplashFromEdge(
  pieces: readonly Piece[],
  parentId: string,
  edge: PieceSide,
): Piece[] {
  const child = linkedSplashForEdge(pieces, parentId, edge);
  return child ? pieces.filter((piece) => piece.id !== child.id) : pieces as Piece[];
}

export function synchronizeLinkedSplashes(
  layout: Layout,
  pieces: readonly Piece[] = layout.pieces,
): Piece[] {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  let changed = false;
  const next = pieces.map((piece) => {
    const attachment = piece.attachment;
    if (
      !isBacksplashPiece(piece) ||
      attachment?.kind !== 'backsplash' ||
      !attachment.parentPieceId ||
      attachment.linkedLength === false ||
      !attachment.sourceEdge
    ) {
      return piece;
    }

    const parent = byId.get(attachment.parentPieceId);
    if (!parent) return piece;
    const placement = linkedSplashPlacement(
      parent,
      attachment.sourceEdge,
      piece.h,
      attachment.offset,
    );
    const nextWidth = placement.length;
    let candidate = piece;

    if (candidate.w !== nextWidth) {
      candidate = { ...candidate, w: nextWidth };
    }

    if (attachment.snapped !== false) {
      if (splashPlacementFitsLayout(layout, placement)) {
        if (
          candidate.x !== placement.x ||
          candidate.y !== placement.y ||
          candidate.rotation !== placement.rotation
        ) {
          candidate = {
            ...candidate,
            x: placement.x,
            y: placement.y,
            rotation: placement.rotation,
          };
        }
      } else if (attachment.snapped !== false) {
        candidate = {
          ...candidate,
          attachment: { ...attachment, snapped: false },
        };
      }
    }

    if (candidate !== piece) changed = true;
    return candidate;
  });
  return changed ? next : pieces as Piece[];
}
