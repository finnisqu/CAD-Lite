import { round3 } from '../../core/numeric';
import { geometryKernel, rotateVector, type Point } from '../../geometry';
import type { Layout } from '../project/types';
import { pieceFabricationOutline } from './fabrication-shape';
import { pieceCenterFromGeometryPose } from './geometry';
import { pieceGeometry, piecePose } from './factory';
import { isBacksplashPiece } from './relationships';
import type {
  Piece,
  PieceFabricationPoint,
  PieceFabricationWeld,
  PiecePose,
} from './types';

const WELD_EPSILON = 0.001;

export type PieceWeldPreparationResult =
  | {
      ok: true;
      weld: PieceFabricationWeld;
      memberIds: string[];
      sourceSignature: string;
    }
  | { ok: false; reason: string };

function normalizedPoint(point: Point): PieceFabricationPoint {
  return { x: round3(point.x), y: round3(point.y) };
}

function localPointToWorld(
  piece: Piece,
  point: PieceFabricationPoint,
  pose: PiecePose = piecePose(piece, 'design'),
): Point {
  const center = pieceCenterFromGeometryPose(pieceGeometry(piece), pose);
  const offset = rotateVector(
    point.x - piece.w / 2,
    point.y - piece.h / 2,
    pose.rotation,
  );
  return {
    x: center.x + offset.x,
    y: center.y + offset.y,
  };
}

function worldPointToLocal(
  piece: Piece,
  point: Point,
  pose: PiecePose = piecePose(piece, 'design'),
): PieceFabricationPoint {
  const center = pieceCenterFromGeometryPose(pieceGeometry(piece), pose);
  const offset = rotateVector(
    point.x - center.x,
    point.y - center.y,
    -pose.rotation,
  );
  return normalizedPoint({
    x: offset.x + piece.w / 2,
    y: offset.y + piece.h / 2,
  });
}

export function pieceFabricationWorldOutline(piece: Piece): Point[] {
  return pieceFabricationOutline(piece).map((point) =>
    localPointToWorld(piece, point),
  );
}

function memberRelativeOutline(
  piece: Piece,
  anchor: Piece,
): PieceFabricationPoint[] {
  return pieceFabricationWorldOutline(piece).map((point) =>
    worldPointToLocal(anchor, point),
  );
}

/**
 * Signature only the geometry/relative pose that determines the welded union.
 * Because every member is expressed in the anchor's local frame, translating
 * or rotating the whole welded family together leaves the signature unchanged.
 */
export function pieceWeldSourceSignature(
  members: readonly Piece[],
  anchor: Piece,
): string {
  return JSON.stringify(
    [...members]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((piece) => ({
        id: piece.id,
        groupId: piece.pieceGroupId,
        outer: memberRelativeOutline(piece, anchor),
      })),
  );
}

function sameStringList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function canonicalMemberIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export function pieceWeldMembers(
  layout: Layout,
  weld: PieceFabricationWeld,
): Piece[] {
  const wanted = new Set(weld.memberIds);
  return layout.pieces.filter((piece) => wanted.has(piece.id));
}

export function isPieceWeldValid(
  layout: Layout,
  weld: PieceFabricationWeld,
): boolean {
  if (
    weld.version !== 1 ||
    !weld.id.trim() ||
    !weld.groupId.trim() ||
    !weld.anchorPieceId.trim() ||
    weld.outer.length < 3
  ) {
    return false;
  }

  const canonical = canonicalMemberIds(weld.memberIds);
  if (canonical.length < 2 || !sameStringList(canonical, weld.memberIds)) {
    return false;
  }
  if (!canonical.includes(weld.anchorPieceId)) return false;

  const members = pieceWeldMembers(layout, weld);
  if (members.length !== canonical.length) return false;
  const anchor = members.find((piece) => piece.id === weld.anchorPieceId);
  if (!anchor) return false;

  if (
    members.some(
      (piece) =>
        piece.pieceGroupId !== weld.groupId ||
        isBacksplashPiece(piece) ||
        piece.fabricationWeld?.id !== weld.id ||
        piece.fabricationWeld.anchorPieceId !== weld.anchorPieceId ||
        piece.fabricationWeld.groupId !== weld.groupId ||
        !sameStringList(piece.fabricationWeld.memberIds, canonical),
    )
  ) {
    return false;
  }

  return pieceWeldSourceSignature(members, anchor) === weld.sourceSignature;
}

export function validPieceWelds(layout: Layout): PieceFabricationWeld[] {
  const byId = new Map<string, PieceFabricationWeld>();
  layout.pieces.forEach((piece) => {
    const weld = piece.fabricationWeld;
    if (weld?.id && !byId.has(weld.id)) byId.set(weld.id, weld);
  });
  return [...byId.values()].filter((weld) => isPieceWeldValid(layout, weld));
}

export function pieceWeldWorldOutline(
  layout: Layout,
  weld: PieceFabricationWeld,
  anchorPose?: PiecePose,
): Point[] {
  if (!isPieceWeldValid(layout, weld)) return [];
  const anchor = layout.pieces.find((piece) => piece.id === weld.anchorPieceId);
  if (!anchor) return [];
  return weld.outer.map((point) =>
    localPointToWorld(anchor, point, anchorPose ?? piecePose(anchor, 'design')),
  );
}

export async function preparePieceWeld(
  layout: Layout,
  requestedIds: readonly string[],
  weldId: string,
): Promise<PieceWeldPreparationResult> {
  const memberIds = canonicalMemberIds(requestedIds);
  if (memberIds.length < 2) {
    return { ok: false, reason: 'Select at least two Pieces to weld.' };
  }
  if (!weldId.trim()) {
    return { ok: false, reason: 'Weld ID is required.' };
  }

  const members = layout.pieces.filter((piece) => memberIds.includes(piece.id));
  if (members.length !== memberIds.length) {
    return { ok: false, reason: 'One or more selected Pieces no longer exist.' };
  }
  if (members.some(isBacksplashPiece)) {
    return { ok: false, reason: 'Linked splashes are welded separately.' };
  }
  if (members.some((piece) => piece.fabricationWeld)) {
    return { ok: false, reason: 'Unweld existing Pieces before creating another weld.' };
  }
  if (members.some((piece) => piece.assemblyLinks.some((link) => link.kind === 'seam'))) {
    return { ok: false, reason: 'Seam-linked fabrication Pieces cannot be welded directly.' };
  }

  const groupId = members[0]?.pieceGroupId ?? null;
  if (!groupId || members.some((piece) => piece.pieceGroupId !== groupId)) {
    return { ok: false, reason: 'Welded Pieces must belong to the same Piece Group.' };
  }

  const regions = await geometryKernel.polygonBoolean(
    members.map(pieceFabricationWorldOutline),
    [],
    'union',
  );
  if (regions.length !== 1) {
    return {
      ok: false,
      reason: 'Selected Pieces must touch or overlap to form one continuous stone region.',
    };
  }
  const region = regions[0];
  if (!region || region.outer.length < 3) {
    return { ok: false, reason: 'The welded perimeter could not be resolved.' };
  }
  if (region.holes.length > 0) {
    return {
      ok: false,
      reason: 'This weld would create an enclosed void. Use a semantic Cutout instead.',
    };
  }

  const anchor = members[0]!;
  const sourceSignature = pieceWeldSourceSignature(members, anchor);
  return {
    ok: true,
    memberIds,
    sourceSignature: JSON.stringify(layout),
    weld: {
      version: 1,
      id: weldId.trim(),
      groupId,
      anchorPieceId: anchor.id,
      memberIds,
      sourceSignature,
      outer: region.outer.map((point) => worldPointToLocal(anchor, point)),
    },
  };
}

export function clearPieceWeld(
  pieces: readonly Piece[],
  weldId: string,
): Piece[] {
  let changed = false;
  const output = pieces.map((piece) => {
    if (piece.fabricationWeld?.id !== weldId) return piece;
    changed = true;
    return { ...piece, fabricationWeld: null };
  });
  return changed ? output : (pieces as Piece[]);
}

/**
 * Clear stale or partially broken weld relationships after ordinary commands.
 * A common rigid move/rotation remains valid because its source signature is
 * anchor-relative; a relative edit safely unwelds instead of showing stale stone.
 */
export function synchronizePieceWelds(layout: Layout): Layout {
  const weldIds = new Set(
    layout.pieces
      .map((piece) => piece.fabricationWeld?.id ?? '')
      .filter(Boolean),
  );
  if (!weldIds.size) return layout;

  let pieces = layout.pieces;
  weldIds.forEach((weldId) => {
    const source = pieces.find((piece) => piece.fabricationWeld?.id === weldId);
    const weld = source?.fabricationWeld;
    if (!weld) return;
    const candidate = { ...layout, pieces };
    if (isPieceWeldValid(candidate, weld)) return;
    pieces = clearPieceWeld(pieces, weldId);
  });

  return pieces === layout.pieces ? layout : { ...layout, pieces };
}

export function weldTouchesAtBoundary(
  a: Piece,
  b: Piece,
): boolean {
  const distance = geometryKernel.polygonDistance(
    pieceFabricationWorldOutline(a),
    pieceFabricationWorldOutline(b),
  );
  return distance <= WELD_EPSILON;
}
