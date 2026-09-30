import { clamp, round3 } from '../../core/numeric';
import type {
  Piece,
  PieceCutout,
  PieceCutoutKind,
  PieceCutoutPatch,
} from './types';

export const CUTOUT_KINDS: readonly PieceCutoutKind[] = [
  'rectangle',
  'circle',
  'oval',
];

export interface CutoutLocalBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
}

export function cutoutKindLabel(kind: PieceCutoutKind): string {
  if (kind === 'circle') return 'Circle';
  if (kind === 'oval') return 'Oval';
  return 'Rectangle';
}

export function defaultCutoutName(kind: PieceCutoutKind): string {
  if (kind === 'circle') return 'Circular Cutout';
  if (kind === 'oval') return 'Oval Cutout';
  return 'Rectangular Cutout';
}

function normalizeRotation(value: number): number {
  return round3(((value % 360) + 360) % 360);
}

export function createDefaultCutout(
  kind: PieceCutoutKind,
  piece: Pick<Piece, 'w' | 'h'>,
  id: string,
): PieceCutout | null {
  const cutoutId = id.trim();
  if (!cutoutId) return null;

  const base: PieceCutout = {
    id: cutoutId,
    name: defaultCutoutName(kind),
    kind,
    cx: round3(piece.w / 2),
    cy: round3(piece.h / 2),
    w: 6,
    h: 4,
    diameter: null,
    cornerR: 0,
    rotation: 0,
    insideFinish: 'unpolished',
    fabricationSplitCutoutId: null,
  };

  return applyCutoutKind(base, kind, piece);
}

export function applyCutoutKind(
  source: PieceCutout,
  kind: PieceCutoutKind,
  piece: Pick<Piece, 'w' | 'h'>,
): PieceCutout {
  const previous = source.kind;
  const oldName = source.name.trim();
  const generic =
    !oldName ||
    oldName === defaultCutoutName(previous) ||
    oldName === cutoutKindLabel(previous);

  let next: PieceCutout = {
    ...source,
    kind,
  };

  if (kind === 'circle') {
    next = {
      ...next,
      diameter: 2,
      w: 2,
      h: 2,
      cornerR: 1,
      rotation: 0,
    };
  } else if (kind === 'oval') {
    next = {
      ...next,
      diameter: null,
      w: 6,
      h: 4,
      cornerR: 0,
      rotation: 0,
    };
  } else {
    next = {
      ...next,
      diameter: null,
      w: 6,
      h: 4,
      cornerR: 0,
    };
  }

  if (generic) next.name = defaultCutoutName(kind);
  return normalizePieceCutout(next, piece);
}

export function normalizePieceCutout(
  source: PieceCutout,
  piece: Pick<Piece, 'w' | 'h'>,
): PieceCutout {
  const pw = Math.max(0.25, piece.w);
  const ph = Math.max(0.25, piece.h);
  const split = Boolean(source.fabricationSplitCutoutId);

  const cx = split
    ? round3(source.cx)
    : round3(clamp(source.cx, 0, pw));
  const cy = split
    ? round3(source.cy)
    : round3(clamp(source.cy, 0, ph));

  if (source.kind === 'circle') {
    const diameter = round3(
      Math.max(
        0.125,
        source.diameter && source.diameter !== 0
          ? source.diameter
          : source.w && source.w !== 0
            ? source.w
            : 2,
      ),
    );
    return {
      ...source,
      name: source.name.trim() || defaultCutoutName('circle'),
      cx,
      cy,
      diameter,
      w: diameter,
      h: diameter,
      cornerR: diameter / 2,
      rotation: 0,
      insideFinish:
        source.insideFinish === 'polished'
          ? 'polished'
          : 'unpolished',
    };
  }

  const w = round3(Math.max(0.125, source.w || 6));
  const h = round3(Math.max(0.125, source.h || 4));
  return {
    ...source,
    name: source.name.trim() || defaultCutoutName(source.kind),
    cx,
    cy,
    w,
    h,
    diameter: null,
    cornerR:
      source.kind === 'oval'
        ? 0
        : round3(clamp(source.cornerR, 0, Math.min(w, h) / 2)),
    rotation: normalizeRotation(source.rotation),
    insideFinish:
      source.insideFinish === 'polished'
        ? 'polished'
        : 'unpolished',
  };
}

export function updatePieceCutout(
  piece: Piece,
  cutoutId: string,
  patch: PieceCutoutPatch,
): Piece | null {
  const current = piece.cutouts.find((cutout) => cutout.id === cutoutId);
  if (!current) return null;

  let next: PieceCutout = { ...current };

  if (typeof patch.name === 'string') {
    next.name = patch.name.trim();
  }

  if (
    patch.kind === 'rectangle' ||
    patch.kind === 'circle' ||
    patch.kind === 'oval'
  ) {
    if (patch.kind !== next.kind) {
      next = applyCutoutKind(next, patch.kind, piece);
    }
  }

  if (
    patch.insideFinish === 'polished' ||
    patch.insideFinish === 'unpolished'
  ) {
    next.insideFinish = patch.insideFinish;
  }

  if (typeof patch.cx === 'number' && Number.isFinite(patch.cx)) {
    next.cx = round3(clamp(patch.cx, 0, piece.w));
  }
  if (typeof patch.cy === 'number' && Number.isFinite(patch.cy)) {
    next.cy = round3(clamp(patch.cy, 0, piece.h));
  }

  if (next.kind === 'circle') {
    if (
      typeof patch.diameter === 'number' &&
      Number.isFinite(patch.diameter)
    ) {
      next.diameter = Math.max(0.125, patch.diameter);
    }
  } else {
    if (typeof patch.w === 'number' && Number.isFinite(patch.w)) {
      next.w = Math.max(0.125, patch.w);
    }
    if (typeof patch.h === 'number' && Number.isFinite(patch.h)) {
      next.h = Math.max(0.125, patch.h);
    }
    if (
      typeof patch.rotation === 'number' &&
      Number.isFinite(patch.rotation)
    ) {
      next.rotation = patch.rotation;
    }
    if (
      next.kind === 'rectangle' &&
      typeof patch.cornerR === 'number' &&
      Number.isFinite(patch.cornerR)
    ) {
      next.cornerR = Math.max(0, patch.cornerR);
    }
  }

  next = normalizePieceCutout(next, piece);
  if (JSON.stringify(next) === JSON.stringify(current)) return piece;

  return {
    ...piece,
    cutouts: piece.cutouts.map((cutout) =>
      cutout.id === cutoutId ? next : cutout),
  };
}

export function deletePieceCutout(
  piece: Piece,
  cutoutId: string,
): Piece | null {
  if (!piece.cutouts.some((cutout) => cutout.id === cutoutId)) {
    return null;
  }
  return {
    ...piece,
    cutouts: piece.cutouts.filter((cutout) => cutout.id !== cutoutId),
  };
}

export function duplicatePieceCutout(
  piece: Piece,
  cutoutId: string,
  copyId: string,
): Piece | null {
  const id = copyId.trim();
  if (!id || piece.cutouts.some((cutout) => cutout.id === id)) return null;
  const index = piece.cutouts.findIndex((cutout) => cutout.id === cutoutId);
  const source = piece.cutouts[index];
  if (index < 0 || !source) return null;

  const displayName = source.name.trim() || defaultCutoutName(source.kind);
  const copy = normalizePieceCutout(
    {
      ...structuredClone(source),
      id,
      name: displayName + ' Copy',
      cx: round3(clamp(source.cx + 1, 0, piece.w)),
      cy: round3(clamp(source.cy + 1, 0, piece.h)),
      fabricationSplitCutoutId: null,
    },
    piece,
  );

  const cutouts = [...piece.cutouts];
  cutouts.splice(index + 1, 0, copy);
  return { ...piece, cutouts };
}

export function cutoutPerimeterInches(cutout: PieceCutout): number {
  if (cutout.kind === 'circle') {
    return Math.PI * Math.max(0.125, cutout.diameter ?? cutout.w);
  }

  if (cutout.kind === 'oval') {
    const a = Math.max(0.0625, cutout.w / 2);
    const b = Math.max(0.0625, cutout.h / 2);
    const q = ((a - b) * (a - b)) / ((a + b) * (a + b) || 1);
    return (
      Math.PI *
      (a + b) *
      (1 + (3 * q) / (10 + Math.sqrt(Math.max(0, 4 - 3 * q))))
    );
  }

  const w = Math.max(0.125, cutout.w);
  const h = Math.max(0.125, cutout.h);
  const radius = clamp(cutout.cornerR, 0, Math.min(w, h) / 2);
  return Math.max(0, 2 * (w + h - 4 * radius) + 2 * Math.PI * radius);
}

export function cutoutLocalBounds(
  cutout: PieceCutout,
): CutoutLocalBounds {
  const cx = cutout.cx;
  const cy = cutout.cy;

  if (cutout.kind === 'circle') {
    const radius = Math.max(
      0.0625,
      (cutout.diameter ?? cutout.w) / 2,
    );
    return {
      minX: cx - radius,
      maxX: cx + radius,
      minY: cy - radius,
      maxY: cy + radius,
      cx,
      cy,
    };
  }

  const w = Math.max(0.125, cutout.w);
  const h = Math.max(0.125, cutout.h);
  const angle = (cutout.rotation * Math.PI) / 180;
  let hx: number;
  let hy: number;

  if (cutout.kind === 'oval') {
    const a = w / 2;
    const b = h / 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    hx = Math.sqrt(
      a * a * cosine * cosine + b * b * sine * sine,
    );
    hy = Math.sqrt(
      a * a * sine * sine + b * b * cosine * cosine,
    );
  } else {
    hx =
      Math.abs(Math.cos(angle)) * w / 2 +
      Math.abs(Math.sin(angle)) * h / 2;
    hy =
      Math.abs(Math.sin(angle)) * w / 2 +
      Math.abs(Math.cos(angle)) * h / 2;
  }

  return {
    minX: cx - hx,
    maxX: cx + hx,
    minY: cy - hy,
    maxY: cy + hy,
    cx,
    cy,
  };
}

export function cutoutLabelOffset(
  cutout: PieceCutout,
  piece: Pick<Piece, 'w' | 'h'>,
): { x: number; y: number } {
  if (!cutout.fabricationSplitCutoutId) return { x: 0, y: 0 };

  const bounds = cutoutLocalBounds(cutout);
  const minX = Math.max(0, bounds.minX);
  const maxX = Math.min(piece.w, bounds.maxX);
  const minY = Math.max(0, bounds.minY);
  const maxY = Math.min(piece.h, bounds.maxY);
  if (maxX <= minX || maxY <= minY) return { x: 0, y: 0 };

  const targetX = (minX + maxX) / 2;
  const targetY = (minY + maxY) / 2;
  const dx = targetX - cutout.cx;
  const dy = targetY - cutout.cy;
  const rotation =
    cutout.kind === 'circle'
      ? 0
      : (cutout.rotation * Math.PI) / 180;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);

  return {
    x: round3(dx * cosine + dy * sine),
    y: round3(-dx * sine + dy * cosine),
  };
}

function pointInsidePieceLocal(
  piece: Pick<Piece, 'w' | 'h' | 'cornerRadii'>,
  x: number,
  y: number,
  epsilon = 0.002,
): boolean {
  if (
    !(x > epsilon &&
      x < piece.w - epsilon &&
      y > epsilon &&
      y < piece.h - epsilon)
  ) {
    return false;
  }

  const checks = [
    [piece.cornerRadii.tl, x, y],
    [piece.cornerRadii.tr, piece.w - x, y],
    [piece.cornerRadii.br, piece.w - x, piece.h - y],
    [piece.cornerRadii.bl, x, piece.h - y],
  ] as const;

  for (const [radius, dx, dy] of checks) {
    if (radius > 0 && dx < radius && dy < radius) {
      const ox = dx - radius;
      const oy = dy - radius;
      if (ox * ox + oy * oy > radius * radius) return false;
    }
  }
  return true;
}

function cutoutBoundaryPolyline(
  cutout: PieceCutout,
  maxStep = 0.08,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const angle =
    cutout.kind === 'circle'
      ? 0
      : (cutout.rotation * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const map = (x: number, y: number) => ({
    x: cutout.cx + x * cosine - y * sine,
    y: cutout.cy + x * sine + y * cosine,
  });

  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) => {
    const count = Math.max(
      1,
      Math.ceil(Math.hypot(x2 - x1, y2 - y1) / maxStep),
    );
    for (let i = 0; i < count; i += 1) {
      const t = i / count;
      points.push(map(
        x1 + (x2 - x1) * t,
        y1 + (y2 - y1) * t,
      ));
    }
  };

  const arc = (
    cx: number,
    cy: number,
    radius: number,
    start: number,
    end: number,
  ) => {
    const count = Math.max(
      2,
      Math.ceil(Math.abs(end - start) * radius / maxStep),
    );
    for (let i = 0; i < count; i += 1) {
      const t = i / count;
      const theta = start + (end - start) * t;
      points.push(map(
        cx + Math.cos(theta) * radius,
        cy + Math.sin(theta) * radius,
      ));
    }
  };

  if (cutout.kind === 'circle') {
    const radius = Math.max(
      0.0625,
      (cutout.diameter ?? cutout.w) / 2,
    );
    const count = Math.max(
      24,
      Math.ceil(2 * Math.PI * radius / maxStep),
    );
    for (let i = 0; i < count; i += 1) {
      const theta = 2 * Math.PI * i / count;
      points.push({
        x: cutout.cx + Math.cos(theta) * radius,
        y: cutout.cy + Math.sin(theta) * radius,
      });
    }
    return points;
  }

  if (cutout.kind === 'oval') {
    const a = Math.max(0.0625, cutout.w / 2);
    const b = Math.max(0.0625, cutout.h / 2);
    const approx =
      Math.PI *
      (3 * (a + b) -
        Math.sqrt((3 * a + b) * (a + 3 * b)));
    const count = Math.max(24, Math.ceil(approx / maxStep));
    for (let i = 0; i < count; i += 1) {
      const theta = 2 * Math.PI * i / count;
      points.push(map(
        Math.cos(theta) * a,
        Math.sin(theta) * b,
      ));
    }
    return points;
  }

  const w = Math.max(0.125, cutout.w);
  const h = Math.max(0.125, cutout.h);
  const hw = w / 2;
  const hh = h / 2;
  const radius = clamp(cutout.cornerR, 0, Math.min(w, h) / 2);

  if (radius <= 0.0001) {
    line(-hw, -hh, hw, -hh);
    line(hw, -hh, hw, hh);
    line(hw, hh, -hw, hh);
    line(-hw, hh, -hw, -hh);
    return points;
  }

  line(-hw + radius, -hh, hw - radius, -hh);
  arc(hw - radius, -hh + radius, radius, -Math.PI / 2, 0);
  line(hw, -hh + radius, hw, hh - radius);
  arc(hw - radius, hh - radius, radius, 0, Math.PI / 2);
  line(hw - radius, hh, -hw + radius, hh);
  arc(-hw + radius, hh - radius, radius, Math.PI / 2, Math.PI);
  line(-hw, hh - radius, -hw, -hh + radius);
  arc(
    -hw + radius,
    -hh + radius,
    radius,
    Math.PI,
    Math.PI * 1.5,
  );
  return points;
}

export function cutoutEffectivePerimeterInches(
  cutout: PieceCutout,
  piece: Pick<Piece, 'w' | 'h' | 'cornerRadii'>,
): number {
  const points = cutoutBoundaryPolyline(cutout);
  if (points.length < 2) return 0;

  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const z = points[(index + 1) % points.length];
    if (!a || !z) continue;
    const mx = (a.x + z.x) / 2;
    const my = (a.y + z.y) / 2;
    if (pointInsidePieceLocal(piece, mx, my)) {
      total += Math.hypot(z.x - a.x, z.y - a.y);
    }
  }
  return total;
}
