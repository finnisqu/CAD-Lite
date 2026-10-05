import { clamp, normalizeDegrees, round3 } from '../../core/numeric';
import { rotateVector, rotatedRectBoundingSize } from '../../geometry';
import type { Layout } from '../project/types';
import { cloneJson } from '../types';
import { pieceGeometry, piecePose } from './factory';
import { mirrorPieceFabricationShape } from './fabrication-shape';
import { mirrorPieceSink } from './sinks';
import {
  clampPiecePoseToWorkspace,
  pieceCenterFromGeometryPose,
  piecePoseBounds,
  pieceWorkspaceCanvasSize,
  resizePieceGeometry,
} from './geometry';
import {
  fabricationAssemblyIds,
  isBacksplashPiece,
} from './relationships';
import type {
  Piece,
  PieceCutout,
  PiecePose,
  PieceSeam,
  PieceSeamReference,
  PieceSide,
  PieceWorkspace,
} from './types';

export type PieceMirrorAxis = 'h' | 'v';
export type PieceDimension = 'width' | 'height';

export interface PiecePoseUpdate {
  id: string;
  pose: PiecePose;
}

function validPieceIds(
  layout: Layout,
  requested: readonly string[],
): string[] {
  const requestedSet = new Set(requested);
  return layout.pieces
    .filter((piece) => requestedSet.has(piece.id))
    .map((piece) => piece.id);
}

function isSnappedLinkedSplash(piece: Piece): boolean {
  return Boolean(
    piece.attachment?.kind === 'backsplash' &&
      piece.attachment.snapped !== false,
  );
}

function linkedSplashParentId(piece: Piece): string | null {
  return piece.attachment?.kind === 'backsplash'
    ? piece.attachment.parentPieceId
    : null;
}

function expandDesignMoveFamily(
  layout: Layout,
  requested: readonly string[],
): string[] {
  const ids = new Set(validPieceIds(layout, requested));

  [...ids].forEach((id) => {
    fabricationAssemblyIds(layout.pieces, id).forEach((member) => ids.add(member));
  });

  let changed = true;
  while (changed) {
    changed = false;
    layout.pieces.forEach((piece) => {
      const parent = linkedSplashParentId(piece);
      if (
        parent &&
        isSnappedLinkedSplash(piece) &&
        ids.has(parent) &&
        !ids.has(piece.id)
      ) {
        ids.add(piece.id);
        changed = true;
      }
    });
  }

  return layout.pieces
    .filter((piece) => ids.has(piece.id))
    .map((piece) => piece.id);
}

export function pieceRotationFamilyIds(
  layout: Layout,
  requested: readonly string[],
  workspace: PieceWorkspace,
): string[] {
  const ids =
    workspace === 'design'
      ? expandDesignMoveFamily(layout, requested)
      : validPieceIds(layout, requested);

  if (ids.length !== 1 || workspace === 'slab') return ids;

  const piece = layout.pieces.find((candidate) => candidate.id === ids[0]);
  if (piece && isSnappedLinkedSplash(piece)) return [];
  return ids;
}

function boundsForIds(
  layout: Layout,
  ids: readonly string[],
  workspace: PieceWorkspace,
): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  const idSet = new Set(ids);
  const bounds = layout.pieces
    .filter((piece) => idSet.has(piece.id))
    .map((piece) => piecePoseBounds(piece, workspace));

  if (!bounds.length) return null;

  return {
    minX: Math.min(...bounds.map((item) => item.x)),
    minY: Math.min(...bounds.map((item) => item.y)),
    maxX: Math.max(...bounds.map((item) => item.x + item.w)),
    maxY: Math.max(...bounds.map((item) => item.y + item.h)),
  };
}

export function pieceTransformGroupCenter(
  layout: Layout,
  ids: readonly string[],
  workspace: PieceWorkspace,
): { x: number; y: number } | null {
  const bounds = boundsForIds(layout, ids, workspace);
  if (!bounds) return null;
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

function rigidCanvasCorrection(
  layout: Layout,
  workspace: PieceWorkspace,
  boxes: readonly {
    x: number;
    y: number;
    w: number;
    h: number;
  }[],
): { x: number; y: number } {
  if (!boxes.length) return { x: 0, y: 0 };
  const canvas = pieceWorkspaceCanvasSize(layout, workspace);
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));

  let x = 0;
  let y = 0;

  if (maxX - minX <= canvas.w) {
    if (minX < 0) x = -minX;
    else if (maxX > canvas.w) x = canvas.w - maxX;
  } else {
    x = (canvas.w - (minX + maxX)) / 2;
  }

  if (maxY - minY <= canvas.h) {
    if (minY < 0) y = -minY;
    else if (maxY > canvas.h) y = canvas.h - maxY;
  } else {
    y = (canvas.h - (minY + maxY)) / 2;
  }

  return { x, y };
}

export function rotatePieceGroup(
  layout: Layout,
  requested: readonly string[],
  workspace: PieceWorkspace,
  deltaDegrees: number,
): PiecePoseUpdate[] {
  if (!Number.isFinite(deltaDegrees)) return [];
  const ids = pieceRotationFamilyIds(layout, requested, workspace);
  const center = pieceTransformGroupCenter(layout, ids, workspace);
  if (!center || !ids.length) return [];

  const idSet = new Set(ids);
  const proposals = layout.pieces
    .filter((piece) => idSet.has(piece.id))
    .map((piece) => {
      const geometry = pieceGeometry(piece);
      const pose = piecePose(piece, workspace);
      const pieceCenter = pieceCenterFromGeometryPose(geometry, pose);
      const offset = rotateVector(
        pieceCenter.x - center.x,
        pieceCenter.y - center.y,
        deltaDegrees,
      );
      const rotation = round3(
        normalizeDegrees(pose.rotation + deltaDegrees),
      );
      const size = rotatedRectBoundingSize({
        w: geometry.width,
        h: geometry.height,
        rotation,
      });
      const nextCenter = {
        x: center.x + offset.x,
        y: center.y + offset.y,
      };
      return {
        id: piece.id,
        x: nextCenter.x - size.w / 2,
        y: nextCenter.y - size.h / 2,
        w: size.w,
        h: size.h,
        rotation,
      };
    });

  const correction = rigidCanvasCorrection(layout, workspace, proposals);

  return proposals.map((proposal) => ({
    id: proposal.id,
    pose: {
      x: round3(proposal.x + correction.x),
      y: round3(proposal.y + correction.y),
      rotation: proposal.rotation,
    },
  }));
}

export function nudgePieceGroup(
  layout: Layout,
  requested: readonly string[],
  workspace: PieceWorkspace,
  dx: number,
  dy: number,
): PiecePoseUpdate[] {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return [];

  const ids =
    workspace === 'design'
      ? expandDesignMoveFamily(layout, requested)
      : validPieceIds(layout, requested);
  if (!ids.length) return [];

  const bounds = boundsForIds(layout, ids, workspace);
  if (!bounds) return [];

  const canvas = pieceWorkspaceCanvasSize(layout, workspace);
  const resolvedDx = clamp(dx, -bounds.minX, canvas.w - bounds.maxX);
  const resolvedDy = clamp(dy, -bounds.minY, canvas.h - bounds.maxY);
  const idSet = new Set(ids);

  return layout.pieces
    .filter((piece) => idSet.has(piece.id))
    .map((piece) => {
      const pose = piecePose(piece, workspace);
      return {
        id: piece.id,
        pose: {
          x: round3(pose.x + resolvedDx),
          y: round3(pose.y + resolvedDy),
          rotation: pose.rotation,
        },
      };
    });
}

function mirrorSeamReferenceH(
  reference: PieceSeamReference,
): PieceSeamReference {
  if (reference === 'left') return 'right';
  if (reference === 'right') return 'left';
  return reference;
}

function mirrorSeamReferenceV(
  reference: PieceSeamReference,
): PieceSeamReference {
  if (reference === 'top') return 'bottom';
  if (reference === 'bottom') return 'top';
  return reference;
}

function mirrorPieceLocal(
  source: Piece,
  axis: PieceMirrorAxis,
): Piece {
  const piece = cloneJson(source);
  const radii = { ...piece.cornerRadii };
  const edges = { ...piece.edgeProfiles };

  if (axis === 'h') {
    if (!isBacksplashPiece(piece)) {
      piece.overhangs = {
        ...piece.overhangs,
        left: piece.overhangs.right,
        right: piece.overhangs.left,
      };
    }
    piece.cornerRadii = {
      tl: radii.tr,
      tr: radii.tl,
      br: radii.bl,
      bl: radii.br,
    };
    piece.edgeProfiles = {
      top: edges.top,
      right: edges.left,
      bottom: edges.bottom,
      left: edges.right,
    };
    piece.pieceSeams = piece.pieceSeams.map((seam) => ({
      ...seam,
      reference:
        seam.orientation === 'vertical'
          ? mirrorSeamReferenceH(seam.reference)
          : seam.reference,
    }));
  } else {
    if (!isBacksplashPiece(piece)) {
      piece.overhangs = {
        ...piece.overhangs,
        front: piece.overhangs.back,
        back: piece.overhangs.front,
      };
    }
    piece.cornerRadii = {
      tl: radii.bl,
      tr: radii.br,
      br: radii.tr,
      bl: radii.tl,
    };
    piece.edgeProfiles = {
      top: edges.bottom,
      right: edges.right,
      bottom: edges.top,
      left: edges.left,
    };
    piece.pieceSeams = piece.pieceSeams.map((seam) => ({
      ...seam,
      reference:
        seam.orientation === 'horizontal'
          ? mirrorSeamReferenceV(seam.reference)
          : seam.reference,
    }));
  }

  piece.fabricationShape = mirrorPieceFabricationShape(
    piece.fabricationShape,
    piece.w,
    piece.h,
    axis,
  );

  piece.sinks = piece.sinks.map((sink) =>
    mirrorPieceSink(piece, sink, axis));

  if (piece.attachment) {
    const sourceEdge = piece.attachment.sourceEdge;
    if (
      sourceEdge === 'top' ||
      sourceEdge === 'right' ||
      sourceEdge === 'bottom' ||
      sourceEdge === 'left'
    ) {
      piece.attachment = {
        ...piece.attachment,
        sourceEdge:
          axis === 'h'
            ? mirrorSeamReferenceH(sourceEdge)
            : mirrorSeamReferenceV(sourceEdge),
      };
    }
  }

  // v1.5.99 does not alter cutout local coordinates or assembly-link sides here.
  // Preserve that behavioral baseline until those child domains are migrated.
  return piece;
}

function mirrorFamilyIds(
  layout: Layout,
  requested: readonly string[],
): string[] {
  const ids = new Set(validPieceIds(layout, requested));
  let changed = true;

  while (changed) {
    changed = false;
    layout.pieces.forEach((piece) => {
      const parent = linkedSplashParentId(piece);

      if (ids.has(piece.id) && parent && !ids.has(parent)) {
        ids.add(parent);
        changed = true;
      }

      if (
        parent &&
        isSnappedLinkedSplash(piece) &&
        ids.has(parent) &&
        !ids.has(piece.id)
      ) {
        ids.add(piece.id);
        changed = true;
      }
    });
  }

  return layout.pieces
    .filter((piece) => ids.has(piece.id))
    .map((piece) => piece.id);
}

export function mirrorPiecesInLayout(
  layout: Layout,
  requested: readonly string[],
  axis: PieceMirrorAxis,
): Piece[] {
  const ids = mirrorFamilyIds(layout, requested);
  if (!ids.length) return layout.pieces;

  const bounds = boundsForIds(layout, ids, 'design');
  if (!bounds) return layout.pieces;
  const axisX = (bounds.minX + bounds.maxX) / 2;
  const axisY = (bounds.minY + bounds.maxY) / 2;
  const idSet = new Set(ids);

  return layout.pieces.map((source) => {
    if (!idSet.has(source.id)) return source;

    const geometry = pieceGeometry(source);
    const pose = piecePose(source, 'design');
    const center = pieceCenterFromGeometryPose(geometry, pose);
    const targetCenter = {
      x: axis === 'h' ? 2 * axisX - center.x : center.x,
      y: axis === 'v' ? 2 * axisY - center.y : center.y,
    };

    let next = mirrorPieceLocal(source, axis);
    const rotation = normalizeDegrees(-pose.rotation);
    const size = rotatedRectBoundingSize({
      w: next.w,
      h: next.h,
      rotation,
    });
    const clamped = clampPiecePoseToWorkspace(
      layout,
      'design',
      pieceGeometry(next),
      {
        x: round3(targetCenter.x - size.w / 2),
        y: round3(targetCenter.y - size.h / 2),
        rotation,
      },
    );
    next = {
      ...next,
      x: round3(clamped.x),
      y: round3(clamped.y),
      rotation: clamped.rotation,
    };
    return next;
  });
}

function seamSides(piece: Piece): Set<PieceSide> {
  const sides = new Set<PieceSide>();
  piece.assemblyLinks.forEach((link) => {
    const side = link.side;
    if (
      link.kind === 'seam' &&
      (side === 'top' ||
        side === 'right' ||
        side === 'bottom' ||
        side === 'left')
    ) {
      sides.add(side);
    }
  });
  return sides;
}

function fabricationDimensionAnchor(
  piece: Piece,
  dimension: PieceDimension,
): PieceSide | null {
  const sides = seamSides(piece);

  if (dimension === 'width') {
    const left = sides.has('left');
    const right = sides.has('right');
    if (left && !right) return 'left';
    if (right && !left) return 'right';
  } else {
    const top = sides.has('top');
    const bottom = sides.has('bottom');
    if (top && !bottom) return 'top';
    if (bottom && !top) return 'bottom';
  }

  return null;
}

function clampPieceSeams(
  seams: readonly PieceSeam[],
  width: number,
  height: number,
): PieceSeam[] {
  return seams.map((seam) => {
    const maximum =
      seam.orientation === 'horizontal' ? height : width;
    return {
      ...seam,
      offset: round3(
        clamp(seam.offset, 0, Math.max(0, maximum)),
      ),
    };
  });
}

function shiftedFabricationChildren(
  piece: Piece,
  x: number,
  y: number,
): Pick<Piece, 'sinks' | 'cutouts'> {
  const sinks = piece.sinks.map((source) => {
    if (!source.fabricationSplitSinkId || !source.fabricationPose) {
      return source;
    }
    return {
      ...source,
      fabricationPose: {
        cx: round3(source.fabricationPose.cx + x),
        cy: round3(source.fabricationPose.cy + y),
      },
    };
  });

  const cutouts: PieceCutout[] = piece.cutouts.map((source) => {
    if (!source.fabricationSplitCutoutId) return source;
    return {
      ...source,
      cx: round3(source.cx + x),
      cy: round3(source.cy + y),
    };
  });

  return { sinks, cutouts };
}

function poseForResizedPiece(
  piece: Piece,
  width: number,
  height: number,
  pose: PiecePose,
  localShift: { x: number; y: number },
): PiecePose {
  const oldCenter = pieceCenterFromGeometryPose(pieceGeometry(piece), pose);
  const shift = rotateVector(localShift.x, localShift.y, pose.rotation);
  const center = {
    x: oldCenter.x + shift.x,
    y: oldCenter.y + shift.y,
  };
  const size = rotatedRectBoundingSize({
    w: width,
    h: height,
    rotation: pose.rotation,
  });

  return {
    x: round3(center.x - size.w / 2),
    y: round3(center.y - size.h / 2),
    rotation: round3(pose.rotation),
  };
}

export function resizePieceDimensionInLayout(
  layout: Layout,
  pieceId: string,
  dimension: PieceDimension,
  value: number,
): Piece | null {
  const piece = layout.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece || !Number.isFinite(value)) return null;

  const oldValue = dimension === 'width' ? piece.w : piece.h;
  const nextValue = Math.max(0.25, value);
  const delta = nextValue - oldValue;
  if (Math.abs(delta) < 0.0005) return piece;

  const geometry = resizePieceGeometry(
    piece,
    dimension === 'width' ? round3(nextValue) : piece.w,
    dimension === 'height' ? round3(nextValue) : piece.h,
  );
  const anchor = fabricationDimensionAnchor(piece, dimension);
  let next: Piece = {
    ...piece,
    w: geometry.width,
    h: geometry.height,
    cornerRadii: { ...geometry.cornerRadii },
    pieceSeams: clampPieceSeams(
      piece.pieceSeams,
      geometry.width,
      geometry.height,
    ),
  };

  if (!anchor) {
    const designPose = clampPiecePoseToWorkspace(
      layout,
      'design',
      geometry,
      piecePose(piece, 'design'),
    );
    const slabPose = clampPiecePoseToWorkspace(
      layout,
      'slab',
      geometry,
      piecePose(piece, 'slab'),
    );
    return {
      ...next,
      x: designPose.x,
      y: designPose.y,
      rotation: designPose.rotation,
      slabPlacement: slabPose,
    };
  }

  const localShift = { x: 0, y: 0 };
  const fabricationShift = { x: 0, y: 0 };

  if (dimension === 'width') {
    if (anchor === 'left') localShift.x = delta / 2;
    if (anchor === 'right') {
      localShift.x = -delta / 2;
      fabricationShift.x = delta;
    }
  } else {
    if (anchor === 'top') localShift.y = delta / 2;
    if (anchor === 'bottom') {
      localShift.y = -delta / 2;
      fabricationShift.y = delta;
    }
  }

  const shifted = shiftedFabricationChildren(
    next,
    fabricationShift.x,
    fabricationShift.y,
  );
  next = {
    ...next,
    ...shifted,
  };

  const designPose = poseForResizedPiece(
    piece,
    geometry.width,
    geometry.height,
    piecePose(piece, 'design'),
    localShift,
  );
  const slabPose = poseForResizedPiece(
    piece,
    geometry.width,
    geometry.height,
    piecePose(piece, 'slab'),
    localShift,
  );

  return {
    ...next,
    x: designPose.x,
    y: designPose.y,
    rotation: designPose.rotation,
    slabPlacement: slabPose,
  };
}
