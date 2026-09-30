import { normalizeDegrees, round3 } from '../../core/numeric';
import { rotateVector } from '../../geometry';
import type { Layout } from '../project/types';
import {
  clampPiecePoseToWorkspace,
  pieceCenterFromGeometryPose,
} from './geometry';
import { pieceGeometry, piecePose } from './factory';
import {
  fabricationAssemblyIds,
  isBacksplashPiece,
} from './relationships';
import { cutoutLocalBounds, normalizePieceCutout } from './cutouts';
import { pieceSeamLocalCoordinate } from './seams';
import {
  pieceSinkLocalPose,
  sinkFaucetHoles,
} from './sinks';
import type {
  AssemblyLink,
  Piece,
  PieceCutout,
  PiecePose,
  PieceSeam,
  PieceSide,
  PieceSink,
} from './types';

export interface PreparedFabricationTransaction {
  kind: 'split' | 'merge';
  sourceSignature: string;
  pieces: Piece[];
  selectionIds: string[];
  label: string;
}

export type FabricationPreparationResult =
  | { ok: true; plan: PreparedFabricationTransaction }
  | { ok: false; reason: string };

type IdFactory = (kind: string) => string;

const SPLASH_DRAW_GAP = 0;
const DEFAULT_SPLASH_HEIGHT = 4;

function clonedPieces(layout: Layout): Piece[] {
  return structuredClone(layout.pieces);
}

function allocator(
  pieces: readonly Piece[],
  createId: IdFactory,
): (kind: string) => string {
  const used = new Set<string>();
  const collect = (value: unknown): void => {
    if (typeof value === 'string') {
      used.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value).forEach(collect);
    }
  };
  collect(pieces);

  return (kind: string): string => {
    const id = createId(kind);
    if (!id.trim() || used.has(id)) {
      throw new Error('Duplicate or empty generated fabrication ID.');
    }
    used.add(id);
    return id;
  };
}

function seamLinks(piece: Piece): AssemblyLink[] {
  return piece.assemblyLinks.filter(
    (link) => link.kind === 'seam' && Boolean(link.id),
  );
}

function linkSide(link: AssemblyLink): PieceSide | null {
  const side = link.side;
  return side === 'top' ||
    side === 'right' ||
    side === 'bottom' ||
    side === 'left'
    ? side
    : null;
}

function oppositeSide(side: PieceSide): PieceSide {
  if (side === 'top') return 'bottom';
  if (side === 'bottom') return 'top';
  if (side === 'left') return 'right';
  return 'left';
}

function replaceMate(
  pieces: Piece[],
  linkId: string,
  oldPieceId: string,
  newPieceId: string,
): void {
  pieces.forEach((piece) => {
    piece.assemblyLinks = piece.assemblyLinks.map((link) =>
      link.id === linkId && link.matePieceId === oldPieceId
        ? { ...link, matePieceId: newPieceId }
        : link);
  });
}

function normalizeGroups(pieces: Piece[]): Piece[] {
  const counts = new Map<string, number>();
  pieces.forEach((piece) => {
    if (piece.pieceGroupId && !isBacksplashPiece(piece)) {
      counts.set(
        piece.pieceGroupId,
        (counts.get(piece.pieceGroupId) ?? 0) + 1,
      );
    }
  });
  return pieces.map((piece) => {
    if (
      piece.pieceGroupId &&
      !isBacksplashPiece(piece) &&
      (counts.get(piece.pieceGroupId) ?? 0) < 2
    ) {
      return {
        ...piece,
        pieceGroupId: null,
        pieceGroupName: null,
      };
    }
    return piece;
  });
}

function sourceAssemblyGroupId(
  pieces: readonly Piece[],
  source: Piece,
): string | null {
  const members = fabricationAssemblyIds(pieces, source.id);
  if (members.length < 2 || !source.pieceGroupId) return null;
  const groupId = source.pieceGroupId;
  return members.every((id) =>
    pieces.find((piece) => piece.id === id)?.pieceGroupId === groupId)
    ? groupId
    : null;
}

function poseFromLocalCenter(
  layout: Layout,
  pieces: readonly Piece[],
  source: Piece,
  child: Piece,
  localCx: number,
  localCy: number,
  workspace: 'design' | 'slab',
): PiecePose {
  const sourcePose = piecePose(source, workspace);
  const sourceCenter = pieceCenterFromGeometryPose(
    pieceGeometry(source),
    sourcePose,
  );
  const localOffset = {
    x: localCx - source.w / 2,
    y: localCy - source.h / 2,
  };
  const worldOffset = rotateVector(
    localOffset.x,
    localOffset.y,
    sourcePose.rotation,
  );
  const childCenter = {
    x: sourceCenter.x + worldOffset.x,
    y: sourceCenter.y + worldOffset.y,
  };
  const geometry = pieceGeometry(child);
  const provisional: PiecePose = {
    x: 0,
    y: 0,
    rotation: sourcePose.rotation,
  };
  const size = pieceCenterFromGeometryPose(geometry, provisional);
  const raw: PiecePose = {
    x: round3(childCenter.x - size.x),
    y: round3(childCenter.y - size.y),
    rotation: round3(sourcePose.rotation),
  };
  return clampPiecePoseToWorkspace(
    { ...layout, pieces: [...pieces] },
    workspace,
    geometry,
    raw,
  );
}

function sinkBoundsForCut(
  piece: Piece,
  sink: PieceSink,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const pose = pieceSinkLocalPose(piece, sink);
  const angle = pose.angle * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const hw = sink.w / 2;
  const hh = sink.h / 2;
  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ] as const;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  corners.forEach(([x, y]) => {
    const px = pose.cx + x * cosine - y * sine;
    const py = pose.cy + x * sine + y * cosine;
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  });

  sinkFaucetHoles(sink).forEach((hole) => {
    const x = pose.cx + hole.x * cosine - hole.y * sine;
    const y = pose.cy + hole.x * sine + hole.y * cosine;
    minX = Math.min(minX, x - hole.radius);
    maxX = Math.max(maxX, x + hole.radius);
    minY = Math.min(minY, y - hole.radius);
    maxY = Math.max(maxY, y + hole.radius);
  });

  return { minX, maxX, minY, maxY };
}

function sinkAtLocalPose(
  source: PieceSink,
  target: Piece,
  cx: number,
  cy: number,
  preserveFabricationPose = false,
): PieceSink {
  const sink = structuredClone(source);
  const halfH = sink.h / 2;

  if (sink.side === 'front') {
    sink.centerline = round3(cx);
    sink.setback = round3(Math.max(0, target.h - cy - halfH));
  } else if (sink.side === 'back') {
    sink.centerline = round3(cx);
    sink.setback = round3(Math.max(0, cy - halfH));
  } else if (sink.side === 'left') {
    sink.centerline = round3(cy);
    sink.setback = round3(Math.max(0, cx - halfH));
  } else {
    sink.centerline = round3(cy);
    sink.setback = round3(Math.max(0, target.w - cx - halfH));
  }

  sink.fabricationPose =
    preserveFabricationPose || Boolean(sink.fabricationSplitSinkId)
      ? { cx: round3(cx), cy: round3(cy) }
      : null;
  return sink;
}

function splitSinks(
  source: Piece,
  childA: Piece,
  childB: Piece,
  vertical: boolean,
  cutCoordinate: number,
  allocate: (kind: string) => string,
): void {
  childA.sinks = [];
  childB.sinks = [];

  source.sinks.forEach((sink) => {
    const bounds = sinkBoundsForCut(source, sink);
    const spans = vertical
      ? bounds.minX < cutCoordinate - 0.001 &&
        bounds.maxX > cutCoordinate + 0.001
      : bounds.minY < cutCoordinate - 0.001 &&
        bounds.maxY > cutCoordinate + 0.001;
    const pose = pieceSinkLocalPose(source, sink);

    if (spans) {
      const splitId =
        sink.fabricationSplitSinkId ?? allocate('splitSink');
      const seed = {
        ...sink,
        fabricationSplitSinkId: splitId,
      };
      const a = sinkAtLocalPose(seed, childA, pose.cx, pose.cy, true);
      const b = sinkAtLocalPose(
        seed,
        childB,
        vertical ? pose.cx - cutCoordinate : pose.cx,
        vertical ? pose.cy : pose.cy - cutCoordinate,
        true,
      );
      a.id = allocate('sink');
      b.id = allocate('sink');
      childA.sinks.push(a);
      childB.sinks.push(b);
      return;
    }

    const inA = vertical
      ? bounds.maxX <= cutCoordinate + 0.001
      : bounds.maxY <= cutCoordinate + 0.001;
    const target = inA ? childA : childB;
    target.sinks.push(
      sinkAtLocalPose(
        sink,
        target,
        vertical && !inA ? pose.cx - cutCoordinate : pose.cx,
        !vertical && !inA ? pose.cy - cutCoordinate : pose.cy,
        Boolean(sink.fabricationSplitSinkId),
      ),
    );
  });
}

function splitCutouts(
  source: Piece,
  childA: Piece,
  childB: Piece,
  vertical: boolean,
  cutCoordinate: number,
  allocate: (kind: string) => string,
): void {
  childA.cutouts = [];
  childB.cutouts = [];

  source.cutouts.forEach((cutout) => {
    const bounds = cutoutLocalBounds(cutout);
    const spans = vertical
      ? bounds.minX < cutCoordinate - 0.001 &&
        bounds.maxX > cutCoordinate + 0.001
      : bounds.minY < cutCoordinate - 0.001 &&
        bounds.maxY > cutCoordinate + 0.001;

    if (spans) {
      const splitId =
        cutout.fabricationSplitCutoutId ?? allocate('splitCutout');
      const a: PieceCutout = {
        ...structuredClone(cutout),
        id: allocate('cutout'),
        fabricationSplitCutoutId: splitId,
      };
      const b: PieceCutout = {
        ...structuredClone(cutout),
        id: allocate('cutout'),
        cx: vertical ? cutout.cx - cutCoordinate : cutout.cx,
        cy: vertical ? cutout.cy : cutout.cy - cutCoordinate,
        fabricationSplitCutoutId: splitId,
      };
      childA.cutouts.push(normalizePieceCutout(a, childA));
      childB.cutouts.push(normalizePieceCutout(b, childB));
      return;
    }

    const inA = vertical
      ? bounds.maxX <= cutCoordinate + 0.001
      : bounds.maxY <= cutCoordinate + 0.001;
    const target = inA ? childA : childB;
    const copy: PieceCutout = {
      ...structuredClone(cutout),
      id: allocate('cutout'),
      cx:
        vertical && !inA
          ? cutout.cx - cutCoordinate
          : cutout.cx,
      cy:
        !vertical && !inA
          ? cutout.cy - cutCoordinate
          : cutout.cy,
    };
    target.cutouts.push(normalizePieceCutout(copy, target));
  });
}

function splitOtherSeams(
  source: Piece,
  cutSeam: PieceSeam,
  childA: Piece,
  childB: Piece,
  cutCoordinate: number,
  allocate: (kind: string) => string,
): void {
  const vertical = cutSeam.orientation === 'vertical';
  childA.pieceSeams = [];
  childB.pieceSeams = [];

  source.pieceSeams.forEach((seam) => {
    if (seam.id === cutSeam.id) return;
    const coordinate = pieceSeamLocalCoordinate(source, seam);

    if (seam.orientation === cutSeam.orientation) {
      if (coordinate < cutCoordinate - 0.001) {
        childA.pieceSeams.push({
          ...seam,
          reference: vertical ? 'left' : 'top',
          offset: round3(coordinate),
        });
      } else if (coordinate > cutCoordinate + 0.001) {
        childB.pieceSeams.push({
          ...seam,
          reference: vertical ? 'left' : 'top',
          offset: round3(coordinate - cutCoordinate),
        });
      }
      return;
    }

    const a: PieceSeam = {
      ...seam,
      id: allocate('seam'),
      reference: seam.orientation === 'horizontal' ? 'top' : 'left',
      offset: round3(coordinate),
    };
    const b: PieceSeam = {
      ...a,
      id: allocate('seam'),
    };
    childA.pieceSeams.push(a);
    childB.pieceSeams.push(b);
  });
}

function splashEdge(piece: Piece): PieceSide | null {
  const edge = piece.attachment?.sourceEdge;
  return edge === 'top' ||
    edge === 'right' ||
    edge === 'bottom' ||
    edge === 'left'
    ? edge
    : null;
}

function syncLinkedSplash(piece: Piece, parent: Piece): Piece {
  if (!piece.attachment || piece.attachment.linkedLength === false) {
    return piece;
  }
  const edge = splashEdge(piece);
  if (!edge) return piece;

  const next = structuredClone(piece);
  const height = Math.max(0.25, next.h || DEFAULT_SPLASH_HEIGHT);
  const length =
    edge === 'left' || edge === 'right'
      ? Math.max(0.25, parent.h)
      : Math.max(0.25, parent.w);
  next.w = round3(length);

  if (next.attachment?.snapped !== true) return next;

  const parentPose = piecePose(parent, 'design');
  const parentCenter = pieceCenterFromGeometryPose(
    pieceGeometry(parent),
    parentPose,
  );
  const offsetValue = Number(next.attachment.offset);
  const gap = Number.isFinite(offsetValue)
    ? Math.max(0, Math.min(24, offsetValue))
    : SPLASH_DRAW_GAP;
  const edgeInfo =
    edge === 'top'
      ? { ex: 0, ey: -parent.h / 2, nx: 0, ny: -1, rotation: parent.rotation }
      : edge === 'right'
        ? { ex: parent.w / 2, ey: 0, nx: 1, ny: 0, rotation: parent.rotation + 90 }
        : edge === 'bottom'
          ? { ex: 0, ey: parent.h / 2, nx: 0, ny: 1, rotation: parent.rotation }
          : { ex: -parent.w / 2, ey: 0, nx: -1, ny: 0, rotation: parent.rotation + 90 };
  const edgeVector = rotateVector(edgeInfo.ex, edgeInfo.ey, parent.rotation);
  const normal = rotateVector(edgeInfo.nx, edgeInfo.ny, parent.rotation);
  const center = {
    x:
      parentCenter.x +
      edgeVector.x +
      normal.x * (gap + height / 2),
    y:
      parentCenter.y +
      edgeVector.y +
      normal.y * (gap + height / 2),
  };
  next.rotation = normalizeDegrees(edgeInfo.rotation);
  const geometry = pieceGeometry(next);
  const zero = { x: 0, y: 0, rotation: next.rotation };
  const halfBounds = pieceCenterFromGeometryPose(geometry, zero);
  next.x = round3(center.x - halfBounds.x);
  next.y = round3(center.y - halfBounds.y);
  return next;
}

function splitLinkedSplashes(
  pieces: Piece[],
  sourceId: string,
  childA: Piece,
  childB: Piece,
  vertical: boolean,
  allocate: (kind: string) => string,
): void {
  for (let index = 0; index < pieces.length; index += 1) {
    const splash = pieces[index];
    if (
      !splash ||
      !isBacksplashPiece(splash) ||
      splash.attachment?.parentPieceId !== sourceId
    ) {
      continue;
    }

    const edge = splashEdge(splash);
    const spans = vertical
      ? edge === 'top' || edge === 'bottom'
      : edge === 'left' || edge === 'right';

    if (!spans) {
      const belongsA = vertical ? edge === 'left' : edge === 'top';
      const parent = belongsA ? childA : childB;
      const next = syncLinkedSplash(
        {
          ...splash,
          attachment: splash.attachment
            ? {
                ...splash.attachment,
                parentPieceId: parent.id,
                snapped: true,
              }
            : null,
          slabPlacement: {
            x: splash.x,
            y: splash.y,
            rotation: splash.rotation,
          },
        },
        parent,
      );
      pieces[index] = next;
      continue;
    }

    const first = syncLinkedSplash(
      {
        ...splash,
        attachment: splash.attachment
          ? {
              ...splash.attachment,
              parentPieceId: childA.id,
              snapped: true,
            }
          : null,
        slabPlacement: {
          x: splash.x,
          y: splash.y,
          rotation: splash.rotation,
        },
      },
      childA,
    );
    const second = syncLinkedSplash(
      {
        ...structuredClone(splash),
        id: allocate('piece'),
        name: 'Splash',
        attachment: splash.attachment
          ? {
              ...splash.attachment,
              parentPieceId: childB.id,
              snapped: true,
            }
          : null,
        slabPlacement: {
          x: splash.x,
          y: splash.y,
          rotation: splash.rotation,
        },
      },
      childB,
    );
    pieces[index] = first;
    pieces.splice(index + 1, 0, second);
    index += 1;
  }
}

function selectionForMerged(
  pieces: readonly Piece[],
  merged: Piece,
): string[] {
  if (!merged.pieceGroupId) return [merged.id];
  const members = pieces
    .filter(
      (piece) =>
        !isBacksplashPiece(piece) &&
        piece.pieceGroupId === merged.pieceGroupId,
    )
    .map((piece) => piece.id);
  return members.length >= 2 ? members : [merged.id];
}

export function prepareFabricationSplit(
  layout: Layout,
  pieceId: string,
  seamId: string,
  createId: IdFactory,
): FabricationPreparationResult {
  const signature = JSON.stringify(layout);
  const pieces = clonedPieces(layout);
  const source = pieces.find((piece) => piece.id === pieceId);
  if (!source || isBacksplashPiece(source)) {
    return { ok: false, reason: 'Select a countertop piece to cut.' };
  }
  const cutSeam = source.pieceSeams.find((seam) => seam.id === seamId);
  if (!cutSeam) {
    return { ok: false, reason: 'The planning seam no longer exists.' };
  }

  const vertical = cutSeam.orientation === 'vertical';
  const cutCoordinate = pieceSeamLocalCoordinate(source, cutSeam);
  const maximum = vertical ? source.w : source.h;
  if (cutCoordinate <= 0.25 || cutCoordinate >= maximum - 0.25) {
    return {
      ok: false,
      reason: 'Move the seam at least 1/4" away from the piece edge.',
    };
  }

  const existingLinks = seamLinks(source);
  const dividesExisting = existingLinks.some((link) => {
    const side = linkSide(link);
    return vertical
      ? side === 'top' || side === 'bottom'
      : side === 'left' || side === 'right';
  });
  if (dividesExisting) {
    return {
      ok: false,
      reason:
        'This cut would divide an existing fabrication seam. Merge that seam first, or cut from a parallel direction.',
    };
  }

  const allocate = allocator(pieces, createId);
  const childA = structuredClone(source);
  const childB = structuredClone(source);
  childA.id = allocate('piece');
  childB.id = allocate('piece');
  const sourceName = source.name.trim() || 'Piece';
  childA.name = sourceName + ' A';
  childB.name = sourceName + ' B';
  childA.layer = source.layer;
  childB.layer = source.layer + 0.001;

  if (vertical) {
    childA.w = round3(cutCoordinate);
    childB.w = round3(source.w - cutCoordinate);
    childA.h = childB.h = round3(source.h);
  } else {
    childA.h = round3(cutCoordinate);
    childB.h = round3(source.h - cutCoordinate);
    childA.w = childB.w = round3(source.w);
  }

  const existingGroup = sourceAssemblyGroupId(pieces, source);
  const groupId = existingGroup ?? allocate('group');
  const groupName =
    existingGroup
      ? source.pieceGroupName ?? sourceName
      : sourceName;
  childA.pieceGroupId = groupId;
  childB.pieceGroupId = groupId;
  childA.pieceGroupName = groupName;
  childB.pieceGroupName = groupName;

  if (vertical) {
    childA.edgeProfiles = {
      top: source.edgeProfiles.top,
      right: 'seam',
      bottom: source.edgeProfiles.bottom,
      left: source.edgeProfiles.left,
    };
    childB.edgeProfiles = {
      top: source.edgeProfiles.top,
      right: source.edgeProfiles.right,
      bottom: source.edgeProfiles.bottom,
      left: 'seam',
    };
    childA.cornerRadii = {
      tl: source.cornerRadii.tl,
      tr: 0,
      br: 0,
      bl: source.cornerRadii.bl,
    };
    childB.cornerRadii = {
      tl: 0,
      tr: source.cornerRadii.tr,
      br: source.cornerRadii.br,
      bl: 0,
    };
    childA.overhangs = { ...source.overhangs, right: 0 };
    childB.overhangs = { ...source.overhangs, left: 0 };
  } else {
    childA.edgeProfiles = {
      top: source.edgeProfiles.top,
      right: source.edgeProfiles.right,
      bottom: 'seam',
      left: source.edgeProfiles.left,
    };
    childB.edgeProfiles = {
      top: 'seam',
      right: source.edgeProfiles.right,
      bottom: source.edgeProfiles.bottom,
      left: source.edgeProfiles.left,
    };
    childA.cornerRadii = {
      tl: source.cornerRadii.tl,
      tr: source.cornerRadii.tr,
      br: 0,
      bl: 0,
    };
    childB.cornerRadii = {
      tl: 0,
      tr: 0,
      br: source.cornerRadii.br,
      bl: source.cornerRadii.bl,
    };
    childA.overhangs = { ...source.overhangs, front: 0 };
    childB.overhangs = { ...source.overhangs, back: 0 };
  }

  const aLocal = { x: childA.w / 2, y: childA.h / 2 };
  const bLocal = vertical
    ? { x: cutCoordinate + childB.w / 2, y: childB.h / 2 }
    : { x: childB.w / 2, y: cutCoordinate + childB.h / 2 };

  const sourceIndex = pieces.findIndex((piece) => piece.id === source.id);
  if (sourceIndex < 0) {
    return { ok: false, reason: 'The source piece is no longer available.' };
  }

  childA.x = poseFromLocalCenter(
    layout,
    pieces,
    source,
    childA,
    aLocal.x,
    aLocal.y,
    'design',
  ).x;
  childA.y = poseFromLocalCenter(
    layout,
    pieces,
    source,
    childA,
    aLocal.x,
    aLocal.y,
    'design',
  ).y;
  childA.rotation = source.rotation;
  childB.x = poseFromLocalCenter(
    layout,
    pieces,
    source,
    childB,
    bLocal.x,
    bLocal.y,
    'design',
  ).x;
  childB.y = poseFromLocalCenter(
    layout,
    pieces,
    source,
    childB,
    bLocal.x,
    bLocal.y,
    'design',
  ).y;
  childB.rotation = source.rotation;
  childA.slabPlacement = poseFromLocalCenter(
    layout,
    pieces,
    source,
    childA,
    aLocal.x,
    aLocal.y,
    'slab',
  );
  childB.slabPlacement = poseFromLocalCenter(
    layout,
    pieces,
    source,
    childB,
    bLocal.x,
    bLocal.y,
    'slab',
  );

  splitSinks(
    source,
    childA,
    childB,
    vertical,
    cutCoordinate,
    allocate,
  );
  splitCutouts(
    source,
    childA,
    childB,
    vertical,
    cutCoordinate,
    allocate,
  );
  splitOtherSeams(
    source,
    cutSeam,
    childA,
    childB,
    cutCoordinate,
    allocate,
  );

  childA.assemblyLinks = [];
  childB.assemblyLinks = [];
  existingLinks.forEach((link) => {
    const side = linkSide(link);
    if (!side) return;
    const belongsA = vertical ? side === 'left' : side === 'top';
    const target = belongsA ? childA : childB;
    target.assemblyLinks.push({ ...link });
    replaceMate(pieces, link.id, source.id, target.id);
  });

  const linkId = allocate('link');
  const aSide: PieceSide = vertical ? 'right' : 'bottom';
  const bSide = oppositeSide(aSide);
  const metadata = {
    orientation: vertical ? 'vertical' : 'horizontal',
    sourceName,
    sourceSeamId: cutSeam.id,
    cutCoordinate: round3(cutCoordinate),
  } as const;
  childA.assemblyLinks.push({
    id: linkId,
    kind: 'seam',
    side: aSide,
    matePieceId: childB.id,
    mateSide: bSide,
    ...metadata,
  });
  childB.assemblyLinks.push({
    id: linkId,
    kind: 'seam',
    side: bSide,
    matePieceId: childA.id,
    mateSide: aSide,
    ...metadata,
  });

  pieces.splice(sourceIndex, 1, childA, childB);
  splitLinkedSplashes(
    pieces,
    source.id,
    childA,
    childB,
    vertical,
    allocate,
  );
  const normalized = normalizeGroups(pieces);

  return {
    ok: true,
    plan: {
      kind: 'split',
      sourceSignature: signature,
      pieces: normalized,
      selectionIds: [childA.id],
      label: 'Cut piece at seam',
    },
  };
}

interface SeamPair {
  first: Piece;
  second: Piece;
  firstLink: AssemblyLink;
  secondLink: AssemblyLink;
  vertical: boolean;
}

function findSeamPair(
  pieces: readonly Piece[],
  linkId: string,
): SeamPair | null {
  for (const piece of pieces) {
    const link = piece.assemblyLinks.find(
      (candidate) => candidate.kind === 'seam' && candidate.id === linkId,
    );
    if (!link) continue;
    const mate = pieces.find((candidate) => candidate.id === link.matePieceId);
    if (!mate) return null;
    const mateLink = mate.assemblyLinks.find(
      (candidate) =>
        candidate.kind === 'seam' &&
        candidate.id === linkId &&
        candidate.matePieceId === piece.id,
    );
    if (!mateLink) return null;

    const side = linkSide(link);
    const mateSide = linkSide(mateLink);
    const vertical =
      (side === 'right' && mateSide === 'left') ||
      (side === 'left' && mateSide === 'right');
    const horizontal =
      (side === 'bottom' && mateSide === 'top') ||
      (side === 'top' && mateSide === 'bottom');
    if (!vertical && !horizontal) return null;

    if (
      (vertical && side === 'left') ||
      (horizontal && side === 'top')
    ) {
      return {
        first: mate,
        second: piece,
        firstLink: mateLink,
        secondLink: link,
        vertical,
      };
    }
    return {
      first: piece,
      second: mate,
      firstLink: link,
      secondLink: mateLink,
      vertical,
    };
  }
  return null;
}

function rotationDifference(a: number, b: number): number {
  const delta = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(delta, 360 - delta);
}

function mergePlanningSeams(
  first: Piece,
  second: Piece,
  merged: Piece,
  vertical: boolean,
  allocate: (kind: string) => string,
): PieceSeam[] {
  const entries: Array<{
    orientation: 'vertical' | 'horizontal';
    coordinate: number;
  }> = [];
  const add = (piece: Piece, dx: number, dy: number): void => {
    piece.pieceSeams.forEach((seam) => {
      const coordinate = pieceSeamLocalCoordinate(piece, seam);
      entries.push({
        orientation: seam.orientation,
        coordinate: round3(
          coordinate +
            (seam.orientation === 'vertical' ? dx : dy),
        ),
      });
    });
  };
  if (vertical) {
    add(first, 0, 0);
    add(second, first.w, 0);
  } else {
    add(first, 0, 0);
    add(second, 0, first.h);
  }

  const unique: typeof entries = [];
  entries.forEach((entry) => {
    if (
      unique.some(
        (item) =>
          item.orientation === entry.orientation &&
          Math.abs(item.coordinate - entry.coordinate) < 0.001,
      )
    ) {
      return;
    }
    unique.push(entry);
  });

  return unique
    .filter((entry) =>
      entry.coordinate >= 0 &&
      entry.coordinate <=
        (entry.orientation === 'vertical' ? merged.w : merged.h))
    .map((entry) => ({
      id: allocate('seam'),
      orientation: entry.orientation,
      reference: entry.orientation === 'vertical' ? 'left' : 'top',
      offset: round3(entry.coordinate),
    }));
}

function mergedSinkAtPose(
  sink: PieceSink,
  sourcePiece: Piece,
  merged: Piece,
  dx: number,
  dy: number,
): PieceSink {
  const pose = pieceSinkLocalPose(sourcePiece, sink);
  return sinkAtLocalPose(
    sink,
    merged,
    pose.cx + dx,
    pose.cy + dy,
    Boolean(sink.fabricationSplitSinkId),
  );
}

function mergeSinks(
  pieces: readonly Piece[],
  first: Piece,
  second: Piece,
  merged: Piece,
  vertical: boolean,
): PieceSink[] {
  const result: PieceSink[] = [];
  const seen = new Set<string>();
  const add = (
    sourcePiece: Piece,
    sink: PieceSink,
    dx: number,
    dy: number,
  ): void => {
    const splitId = sink.fabricationSplitSinkId;
    if (splitId && seen.has(splitId)) return;
    if (splitId) seen.add(splitId);
    result.push(mergedSinkAtPose(sink, sourcePiece, merged, dx, dy));
  };

  first.sinks.forEach((sink) => add(first, sink, 0, 0));
  second.sinks.forEach((sink) =>
    add(second, sink, vertical ? first.w : 0, vertical ? 0 : first.h));

  const outside = new Set<string>();
  pieces.forEach((piece) => {
    if (piece.id === first.id || piece.id === second.id) return;
    piece.sinks.forEach((sink) => {
      if (sink.fabricationSplitSinkId) outside.add(sink.fabricationSplitSinkId);
    });
  });

  return result.map((sink) => {
    const splitId = sink.fabricationSplitSinkId;
    if (!splitId || outside.has(splitId)) return sink;
    const pose = pieceSinkLocalPose(merged, sink);
    const ordinary = {
      ...sink,
      fabricationSplitSinkId: null,
      fabricationPose: null,
    };
    return sinkAtLocalPose(ordinary, merged, pose.cx, pose.cy, false);
  });
}

function mergeCutouts(
  pieces: readonly Piece[],
  first: Piece,
  second: Piece,
  merged: Piece,
  vertical: boolean,
  allocate: (kind: string) => string,
): PieceCutout[] {
  const result: PieceCutout[] = [];
  const seen = new Set<string>();
  const add = (cutout: PieceCutout, dx: number, dy: number): void => {
    const splitId = cutout.fabricationSplitCutoutId;
    if (splitId && seen.has(splitId)) return;
    if (splitId) seen.add(splitId);
    result.push({
      ...structuredClone(cutout),
      id: allocate('cutout'),
      cx: round3(cutout.cx + dx),
      cy: round3(cutout.cy + dy),
    });
  };

  first.cutouts.forEach((cutout) => add(cutout, 0, 0));
  second.cutouts.forEach((cutout) =>
    add(cutout, vertical ? first.w : 0, vertical ? 0 : first.h));

  const outside = new Set<string>();
  pieces.forEach((piece) => {
    if (piece.id === first.id || piece.id === second.id) return;
    piece.cutouts.forEach((cutout) => {
      if (cutout.fabricationSplitCutoutId) {
        outside.add(cutout.fabricationSplitCutoutId);
      }
    });
  });

  return result.map((cutout) =>
    normalizePieceCutout(
      outside.has(cutout.fabricationSplitCutoutId ?? '')
        ? cutout
        : { ...cutout, fabricationSplitCutoutId: null },
      merged,
    ));
}

function mergeLinkedSplashes(
  pieces: Piece[],
  first: Piece,
  second: Piece,
  merged: Piece,
  vertical: boolean,
): void {
  const parentIds = new Set([first.id, second.id]);
  const kept = new Map<PieceSide, string>();
  const remove = new Set<string>();

  pieces.forEach((piece, index) => {
    const attachment = piece.attachment;
    if (
      !isBacksplashPiece(piece) ||
      !attachment ||
      !parentIds.has(attachment.parentPieceId)
    ) {
      return;
    }
    const edge = splashEdge(piece);
    if (!edge) return;
    const valid = vertical
      ? edge === 'top' ||
        edge === 'bottom' ||
        (edge === 'left' && attachment.parentPieceId === first.id) ||
        (edge === 'right' && attachment.parentPieceId === second.id)
      : edge === 'left' ||
        edge === 'right' ||
        (edge === 'top' && attachment.parentPieceId === first.id) ||
        (edge === 'bottom' && attachment.parentPieceId === second.id);

    if (!valid) {
      pieces[index] = {
        ...piece,
        attachment: {
          ...attachment,
          parentPieceId: null,
          linkedLength: false,
        },
      };
      return;
    }

    if (kept.has(edge)) {
      remove.add(piece.id);
      return;
    }

    kept.set(edge, piece.id);
    pieces[index] = syncLinkedSplash(
      {
        ...piece,
        attachment: {
          ...attachment,
          parentPieceId: merged.id,
        },
      },
      merged,
    );
  });

  if (remove.size) {
    const survivors = pieces.filter((piece) => !remove.has(piece.id));
    pieces.splice(0, pieces.length, ...survivors);
  }
}

export function prepareFabricationMerge(
  layout: Layout,
  linkId: string,
  createId: IdFactory,
): FabricationPreparationResult {
  const signature = JSON.stringify(layout);
  const pieces = clonedPieces(layout);
  const pair = findSeamPair(pieces, linkId);
  if (!pair) {
    return {
      ok: false,
      reason: 'These seam edges are no longer a compatible mating pair.',
    };
  }

  const { first, second, firstLink, vertical } = pair;
  if (rotationDifference(first.rotation, second.rotation) > 0.01) {
    return {
      ok: false,
      reason:
        'The two fabrication pieces must have the same rotation before merging.',
    };
  }
  if (vertical && Math.abs(first.h - second.h) > 0.01) {
    return {
      ok: false,
      reason:
        'The two fabrication pieces must have matching depths before merging.',
    };
  }
  if (!vertical && Math.abs(first.w - second.w) > 0.01) {
    return {
      ok: false,
      reason:
        'The two fabrication pieces must have matching widths before merging.',
    };
  }

  const center1 = pieceCenterFromGeometryPose(
    pieceGeometry(first),
    piecePose(first, 'design'),
  );
  const center2 = pieceCenterFromGeometryPose(
    pieceGeometry(second),
    piecePose(second, 'design'),
  );
  const localDelta = rotateVector(
    center2.x - center1.x,
    center2.y - center1.y,
    -first.rotation,
  );
  const expected = vertical
    ? { x: (first.w + second.w) / 2, y: 0 }
    : { x: 0, y: (first.h + second.h) / 2 };
  if (
    Math.hypot(
      localDelta.x - expected.x,
      localDelta.y - expected.y,
    ) > 0.125
  ) {
    return {
      ok: false,
      reason:
        'Move the two fabrication pieces back together on their seam before merging.',
    };
  }

  if (
    vertical &&
    (Math.abs(first.overhangs.front - second.overhangs.front) > 0.01 ||
      Math.abs(first.overhangs.back - second.overhangs.back) > 0.01)
  ) {
    return {
      ok: false,
      reason:
        'Match the Front and Back overhangs across this fabrication seam before merging.',
    };
  }
  if (
    !vertical &&
    (Math.abs(first.overhangs.left - second.overhangs.left) > 0.01 ||
      Math.abs(first.overhangs.right - second.overhangs.right) > 0.01)
  ) {
    return {
      ok: false,
      reason:
        'Match the Left and Right overhangs across this fabrication seam before merging.',
    };
  }
  if (
    vertical &&
    (first.edgeProfiles.top !== second.edgeProfiles.top ||
      first.edgeProfiles.bottom !== second.edgeProfiles.bottom)
  ) {
    return {
      ok: false,
      reason:
        'The top/bottom edge profiles differ across this seam. Match them before merging.',
    };
  }
  if (
    !vertical &&
    (first.edgeProfiles.left !== second.edgeProfiles.left ||
      first.edgeProfiles.right !== second.edgeProfiles.right)
  ) {
    return {
      ok: false,
      reason:
        'The left/right edge profiles differ across this seam. Match them before merging.',
    };
  }

  const allocate = allocator(pieces, createId);
  const merged = structuredClone(first);
  merged.id = allocate('piece');
  merged.name =
    String(firstLink.sourceName ?? '').trim() ||
    first.name.trim() ||
    'Piece';

  if (vertical) {
    merged.w = round3(first.w + second.w);
    merged.h = round3(first.h);
    merged.edgeProfiles = {
      top: first.edgeProfiles.top,
      right: second.edgeProfiles.right,
      bottom: first.edgeProfiles.bottom,
      left: first.edgeProfiles.left,
    };
    merged.cornerRadii = {
      tl: first.cornerRadii.tl,
      tr: second.cornerRadii.tr,
      br: second.cornerRadii.br,
      bl: first.cornerRadii.bl,
    };
    merged.overhangs = {
      front: round3(first.overhangs.front),
      back: round3(first.overhangs.back),
      left: round3(first.overhangs.left),
      right: round3(second.overhangs.right),
    };
  } else {
    merged.w = round3(first.w);
    merged.h = round3(first.h + second.h);
    merged.edgeProfiles = {
      top: first.edgeProfiles.top,
      right: first.edgeProfiles.right,
      bottom: second.edgeProfiles.bottom,
      left: first.edgeProfiles.left,
    };
    merged.cornerRadii = {
      tl: first.cornerRadii.tl,
      tr: first.cornerRadii.tr,
      br: second.cornerRadii.br,
      bl: second.cornerRadii.bl,
    };
    merged.overhangs = {
      front: round3(second.overhangs.front),
      back: round3(first.overhangs.back),
      left: round3(first.overhangs.left),
      right: round3(first.overhangs.right),
    };
  }

  const mergedOffset = vertical
    ? { x: second.w / 2, y: 0 }
    : { x: 0, y: second.h / 2 };
  const designShift = rotateVector(
    mergedOffset.x,
    mergedOffset.y,
    first.rotation,
  );
  const designCenter = {
    x: center1.x + designShift.x,
    y: center1.y + designShift.y,
  };
  const geometry = pieceGeometry(merged);
  const designHalf = pieceCenterFromGeometryPose(geometry, {
    x: 0,
    y: 0,
    rotation: first.rotation,
  });
  const designPose = clampPiecePoseToWorkspace(
    { ...layout, pieces },
    'design',
    geometry,
    {
      x: round3(designCenter.x - designHalf.x),
      y: round3(designCenter.y - designHalf.y),
      rotation: first.rotation,
    },
  );
  merged.x = designPose.x;
  merged.y = designPose.y;
  merged.rotation = designPose.rotation;

  const firstSlab = piecePose(first, 'slab');
  const slabCenter = pieceCenterFromGeometryPose(
    pieceGeometry(first),
    firstSlab,
  );
  const slabShift = rotateVector(
    mergedOffset.x,
    mergedOffset.y,
    firstSlab.rotation,
  );
  const mergedSlabCenter = {
    x: slabCenter.x + slabShift.x,
    y: slabCenter.y + slabShift.y,
  };
  const slabHalf = pieceCenterFromGeometryPose(geometry, {
    x: 0,
    y: 0,
    rotation: firstSlab.rotation,
  });
  merged.slabPlacement = clampPiecePoseToWorkspace(
    { ...layout, pieces },
    'slab',
    geometry,
    {
      x: round3(mergedSlabCenter.x - slabHalf.x),
      y: round3(mergedSlabCenter.y - slabHalf.y),
      rotation: firstSlab.rotation,
    },
  );

  merged.sinks = mergeSinks(pieces, first, second, merged, vertical);
  merged.cutouts = mergeCutouts(
    pieces,
    first,
    second,
    merged,
    vertical,
    allocate,
  );
  merged.pieceSeams = mergePlanningSeams(
    first,
    second,
    merged,
    vertical,
    allocate,
  );

  const external: AssemblyLink[] = [];
  [first, second].forEach((piece) => {
    piece.assemblyLinks.forEach((link) => {
      if (link.id === linkId || link.kind !== 'seam') return;
      if (external.some((item) => item.id === link.id)) return;
      external.push({ ...link });
      replaceMate(pieces, link.id, piece.id, merged.id);
    });
  });
  merged.assemblyLinks = external;

  const firstIndex = pieces.findIndex((piece) => piece.id === first.id);
  const secondIndex = pieces.findIndex((piece) => piece.id === second.id);
  if (firstIndex < 0 || secondIndex < 0) {
    return { ok: false, reason: 'The fabrication pieces are no longer available.' };
  }
  const insertAt = Math.min(firstIndex, secondIndex);
  const without = pieces.filter(
    (piece) => piece.id !== first.id && piece.id !== second.id,
  );
  without.splice(Math.min(insertAt, without.length), 0, merged);
  mergeLinkedSplashes(without, first, second, merged, vertical);
  const normalized = normalizeGroups(without);
  const normalizedMerged =
    normalized.find((piece) => piece.id === merged.id) ?? merged;

  return {
    ok: true,
    plan: {
      kind: 'merge',
      sourceSignature: signature,
      pieces: normalized,
      selectionIds: selectionForMerged(normalized, normalizedMerged),
      label: 'Merge fabrication seam',
    },
  };
}
