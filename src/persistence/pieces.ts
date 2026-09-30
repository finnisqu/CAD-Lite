import { cloneJson, isJsonObject, type JsonObject } from '../domain/types';
import type {
  Piece,
  FabricationChild,
  AssemblyLink,
  PieceSeam,
  PieceSeamOrientation,
  PieceSink,
  PieceSinkSide,
  PieceSinkType,
  PieceSide,
  PieceCutout,
  PieceCutoutKind,
} from '../domain/pieces/types';
import {
  DEFAULT_FAUCET_HOLE_DIAMETER,
  DEFAULT_FAUCET_SETBACK,
  DEFAULT_FAUCET_SPACING,
  SINK_STANDARD_SETBACK,
} from '../domain/pieces/sinks';
import { clamp, round3 } from '../core/numeric';
import { validatePieceRelationships } from '../domain/pieces/relationships';

const number = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const object = (value: unknown): JsonObject => isJsonObject(value) ? value : {};
const positive = (value: unknown, fallback: number): number => {
  const n = number(value, fallback); return n > 0 ? n : fallback;
};

function children(raw: unknown, prefix: string): FabricationChild[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter(isJsonObject).map((child, index) => {
    let id = text(child.id) || `${prefix}-${index + 1}`;
    while (seen.has(id)) id += '-duplicate';
    seen.add(id);
    return { ...cloneJson(child), id };
  });
}

function seams(
  raw: unknown,
  prefix: string,
  width: number,
  height: number,
): PieceSeam[] {
  return children(raw, prefix).map((source) => {
    const orientation: PieceSeamOrientation =
      source.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    const validReferences =
      orientation === 'horizontal'
        ? ['top', 'bottom']
        : ['left', 'right'];
    const reference = validReferences.includes(text(source.reference))
      ? text(source.reference)
      : validReferences[0] ?? 'left';
    const maximum = orientation === 'horizontal' ? height : width;
    return {
      ...source,
      orientation,
      reference,
      offset: Math.max(
        0,
        Math.min(maximum, number(source.offset, 0)),
      ),
    } as PieceSeam;
  });
}

function sinkSide(value: unknown): PieceSinkSide {
  return value === 'back' ||
    value === 'left' ||
    value === 'right'
    ? value
    : 'front';
}

function sinkType(
  value: unknown,
  modelId: string | null,
): PieceSinkType {
  if (value === 'model' || value === 'custom') return value;
  return modelId ? 'model' : 'custom';
}

function sinks(raw: unknown, prefix: string): PieceSink[] {
  return children(raw, prefix).map((source) => {
    const modelId = text(source.modelId).trim() || null;
    const rawFaucets = Array.isArray(source.faucets)
      ? source.faucets
      : [];
    const faucets = [...new Set(
      rawFaucets
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.round(value))
        .filter((value) => value >= 0 && value <= 8),
    )].sort((a, b) => a - b);

    const fabricationPose = isJsonObject(source.fabricationPose) &&
      Number.isFinite(Number(source.fabricationPose.cx)) &&
      Number.isFinite(Number(source.fabricationPose.cy))
      ? {
          cx: Number(source.fabricationPose.cx),
          cy: Number(source.fabricationPose.cy),
        }
      : null;

    const sink: PieceSink = {
      ...source,
      id: text(source.id),
      name: text(source.name),
      type: sinkType(source.type, modelId),
      modelId,
      shape: source.shape === 'oval' ? 'oval' : 'rect',
      w: clamp(number(source.w, 16), 0, 999),
      h: clamp(number(source.h, 16), 0, 999),
      cornerR: clamp(number(source.cornerR, 0), 0, 4),
      side: sinkSide(source.side),
      centerline: number(source.centerline, 20),
      setback: Math.max(
        0,
        number(source.setback, SINK_STANDARD_SETBACK),
      ),
      rotation: clamp(number(source.rotation, 0), 0, 360),
      faucets,
      faucetSetback: round3(
        Math.max(
          0,
          number(source.faucetSetback, DEFAULT_FAUCET_SETBACK),
        ),
      ),
      faucetHoleDiameter: round3(
        Math.max(
          0.001,
          number(
            source.faucetHoleDiameter,
            DEFAULT_FAUCET_HOLE_DIAMETER,
          ),
        ),
      ),
      faucetHoleSpacing: round3(
        Math.max(
          0.001,
          number(source.faucetHoleSpacing, DEFAULT_FAUCET_SPACING),
        ),
      ),
      insideFinish:
        source.insideFinish === 'unpolished'
          ? 'unpolished'
          : 'polished',
      fabricationSplitSinkId:
        text(source.fabricationSplitSinkId).trim() || null,
      fabricationPose,
    };
    return sink;
  });
}

function cutoutKind(value: unknown): PieceCutoutKind {
  if (value === 'circle' || value === 'oval') return value;
  return 'rectangle';
}

function normalizedRotation(value: unknown): number {
  const n = Number(value);
  const finite = Number.isFinite(n) ? n : 0;
  return round3(((finite % 360) + 360) % 360);
}

function legacyNumeric(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cutouts(
  raw: unknown,
  prefix: string,
  pieceWidth: number,
  pieceHeight: number,
): PieceCutout[] {
  return children(raw, prefix).map((source) => {
    const kind = cutoutKind(
      source.kind === 'cooktop' ? 'rectangle' : source.kind,
    );
    const name = text(source.name).trim() || (
      kind === 'circle'
        ? 'Circular Cutout'
        : kind === 'oval'
          ? 'Oval Cutout'
          : 'Rectangular Cutout'
    );
    const splitId =
      text(source.fabricationSplitCutoutId).trim() || null;
    const pw = Math.max(0.25, pieceWidth);
    const ph = Math.max(0.25, pieceHeight);
    const rawCx = legacyNumeric(source.cx, pw / 2);
    const rawCy = legacyNumeric(source.cy, ph / 2);
    const cx = splitId
      ? round3(rawCx)
      : round3(clamp(rawCx, 0, pw));
    const cy = splitId
      ? round3(rawCy)
      : round3(clamp(rawCy, 0, ph));

    if (kind === 'circle') {
      const rawDiameter = legacyNumeric(source.diameter, 0);
      const rawWidth = legacyNumeric(source.w, 0);
      const diameter = round3(
        Math.max(0.125, rawDiameter || rawWidth || 2),
      );
      return {
        ...source,
        id: text(source.id),
        name,
        kind,
        cx,
        cy,
        w: diameter,
        h: diameter,
        diameter,
        cornerR: diameter / 2,
        rotation: 0,
        insideFinish:
          source.insideFinish === 'polished'
            ? 'polished'
            : 'unpolished',
        fabricationSplitCutoutId: splitId,
      };
    }

    const rawWidth = legacyNumeric(source.w, 0);
    const rawHeight = legacyNumeric(source.h, 0);
    const w = round3(Math.max(0.125, rawWidth || 6));
    const h = round3(Math.max(0.125, rawHeight || 4));
    const cornerR =
      kind === 'oval'
        ? 0
        : round3(
            clamp(
              legacyNumeric(source.cornerR, 0),
              0,
              Math.min(w, h) / 2,
            ),
          );

    return {
      ...source,
      id: text(source.id),
      name,
      kind,
      cx,
      cy,
      w,
      h,
      diameter: null,
      cornerR,
      rotation: normalizedRotation(source.rotation),
      insideFinish:
        source.insideFinish === 'polished'
          ? 'polished'
          : 'unpolished',
      fabricationSplitCutoutId: splitId,
    };
  });
}

const known = new Set([
  'id','name','x','y','w','h','rotation','layer','areaId','pieceGroupId','pieceGroupName',
  'pieceType','tags','attachment','assemblyLinks','slabPlacement','cornerRadii',
  'rTL','rTR','rBR','rBL','overhangs','edgeProfiles','sinks','cutouts','pieceSeams',
  'color','noFill','fillOpacity','splashKind','splashHeight','legacy',
]);

export function normalizePieces(raw: unknown, areaIds: readonly string[], prefix: string): Piece[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const reserved = new Set(raw.filter(isJsonObject).map(item => text(item.id)).filter(Boolean));
  const pieces: Piece[] = raw.filter(isJsonObject).map((source, index) => {
    let id = text(source.id).trim();
    if (!id || seen.has(id)) {
      id = `${prefix}-${index + 1}`;
      while (reserved.has(id) || seen.has(id)) id += '-migrated';
    }
    seen.add(id);
    const w = positive(source.w, 1), h = positive(source.h, 1);
    const x = number(source.x, 0), y = number(source.y, 0), rotation = number(source.rotation, 0);
    const slab = object(source.slabPlacement), corners = object(source.cornerRadii);
    const overhang = object(source.overhangs), edges = object(source.edgeProfiles);
    const attachment = object(source.attachment);
    const tags = Array.isArray(source.tags) ? source.tags.filter((tag): tag is string => typeof tag === 'string') : [];
    const splash = source.pieceType === 'backsplash' || tags.includes('backsplash') || attachment.kind === 'backsplash';
    const links: AssemblyLink[] = children(source.assemblyLinks, id + '-link').map(link => {
      const side = ['top','right','bottom','left'].includes(text(link.side))
        ? text(link.side) as PieceSide
        : undefined;
      const mateSide = ['top','right','bottom','left'].includes(text(link.mateSide))
        ? text(link.mateSide) as PieceSide
        : undefined;
      const orientation =
        link.orientation === 'horizontal' || link.orientation === 'vertical'
          ? link.orientation
          : undefined;
      return {
        ...link,
        kind: text(link.kind),
        matePieceId: text(link.matePieceId),
        sourceSeamId: text(link.sourceSeamId) || null,
        ...(side ? { side } : {}),
        ...(mateSide ? { mateSide } : {}),
        ...(orientation ? { orientation } : {}),
        ...(text(link.sourceName).trim()
          ? { sourceName: text(link.sourceName).trim() }
          : {}),
        ...(Number.isFinite(Number(link.cutCoordinate))
          ? { cutCoordinate: Number(link.cutCoordinate) }
          : {}),
      };
    });
    const legacy = cloneJson(object(source.legacy));
    Object.entries(source).forEach(([key, value]) => {
      if (!known.has(key)) legacy[key] = cloneJson(value);
    });
    const radius = (key: string, old: string): number =>
      Math.max(0, Math.min(Math.min(w, h) / 2, number(corners[key], source[old] ? 1 : 0)));
    return {
      id, name: text(source.name, 'Piece'), x, y, w, h, rotation,
      layer: number(source.layer, index + 1),
      areaId: areaIds.includes(text(source.areaId)) ? text(source.areaId) : areaIds[0] ?? '',
      pieceGroupId: text(source.pieceGroupId) || null,
      pieceGroupName: text(source.pieceGroupName) || null,
      pieceType: text(source.pieceType, splash ? 'backsplash' : 'countertop'),
      tags,
      attachment: attachment.kind === 'backsplash'
        ? {
            ...cloneJson(attachment),
            kind: 'backsplash',
            parentPieceId: text(attachment.parentPieceId) || null,
            ...(['top','right','bottom','left'].includes(text(attachment.sourceEdge))
              ? { sourceEdge: text(attachment.sourceEdge) as PieceSide }
              : {}),
            ...(typeof attachment.linkedLength === 'boolean'
              ? { linkedLength: attachment.linkedLength }
              : {}),
            ...(typeof attachment.snapped === 'boolean'
              ? { snapped: attachment.snapped }
              : {}),
            ...(Number.isFinite(Number(attachment.offset))
              ? { offset: Number(attachment.offset) }
              : {}),
          }
        : null,
      assemblyLinks: links,
      slabPlacement: { x: number(slab.x, x), y: number(slab.y, y), rotation: number(slab.rotation, rotation) },
      cornerRadii: { tl: radius('tl','rTL'), tr: radius('tr','rTR'), br: radius('br','rBR'), bl: radius('bl','rBL') },
      overhangs: {
        front: Math.max(0, number(overhang.front, splash ? 0 : 1.5)),
        back: Math.max(0, number(overhang.back, 0)),
        left: Math.max(0, number(overhang.left, 0)),
        right: Math.max(0, number(overhang.right, 0)),
      },
      edgeProfiles: {
        top: text(edges.top, 'none'), right: text(edges.right, 'none'),
        bottom: text(edges.bottom, 'none'), left: text(edges.left, 'none'),
      },
      sinks: sinks(source.sinks, id + '-sink'),
      cutouts: cutouts(source.cutouts, id + '-cutout', w, h),
      pieceSeams: seams(source.pieceSeams, id + '-seam', w, h),
      color: text(source.color, '#ffffff'), noFill: source.noFill === true,
      fillOpacity: typeof source.fillOpacity === 'number' ? Math.max(0, Math.min(1, number(source.fillOpacity, 1))) : null,
      splashKind: text(source.splashKind) || null,
      splashHeight: typeof source.splashHeight === 'number' ? number(source.splashHeight, 4) : null,
      legacy,
    };
  });
  const invalidAttachments = new Set(validatePieceRelationships(pieces, areaIds)
    .filter(issue => issue.kind === 'missing-parent' || issue.kind === 'attachment-cycle')
    .map(issue => issue.pieceId));
  const ids = new Set(pieces.map(piece => piece.id));
  return pieces.map(piece => ({
    ...piece,
    attachment: invalidAttachments.has(piece.id) ? null : piece.attachment,
    assemblyLinks: piece.assemblyLinks.filter(link => ids.has(link.matePieceId) && link.matePieceId !== piece.id),
  }));
}
