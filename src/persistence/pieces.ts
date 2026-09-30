import { cloneJson, isJsonObject, type JsonObject } from '../domain/types';
import type { Piece, FabricationChild, AssemblyLink } from '../domain/pieces/types';
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
    const links: AssemblyLink[] = children(source.assemblyLinks, id + '-link').map(link => ({
      ...link, kind: text(link.kind), matePieceId: text(link.matePieceId),
      sourceSeamId: text(link.sourceSeamId) || null,
    }));
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
      attachment: attachment.kind === 'backsplash' && text(attachment.parentPieceId)
        ? { ...cloneJson(attachment), kind: 'backsplash', parentPieceId: text(attachment.parentPieceId) } : null,
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
      sinks: children(source.sinks, id + '-sink'), cutouts: children(source.cutouts, id + '-cutout'),
      pieceSeams: children(source.pieceSeams, id + '-seam'),
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
