import type { Point } from './types';

export const SMART_SNAP_TOLERANCE = 1.0;

export const SMART_SNAP_PRIORITY = Object.freeze({
  reference: 0,
  object: 1,
  slabClearance: 1,
  slabAlign: 3,
  grid: 9,
} as const);

export type SnapAxis = 'x' | 'y';

export interface SmartSnapCandidateInput extends Record<string, unknown> {
  distance?: unknown;
  d?: unknown;
  guide?: unknown;
  priority?: unknown;
  kind?: string;
  source?: string;
  always?: boolean;
  axis?: unknown;
}

export interface SmartSnapCandidate extends Record<string, unknown> {
  d: number;
  ad: number;
  guide: number | null;
  priority: number;
  kind: string;
  source: string;
  always: boolean;
}

export interface SmartSnapAnchor {
  value: number;
  kind: string;
}

export interface SmartSnapAxes {
  x: SmartSnapCandidate | null;
  y: SmartSnapCandidate | null;
}

export interface SmartSnapPointCandidate extends Record<string, unknown> {
  x: unknown;
  y: unknown;
  priority?: unknown;
}

export interface SmartSnapPointHit extends Record<string, unknown> {
  point: Point;
  d: number;
  ad: number;
  priority: number;
}

export interface SmartSnapPointResult {
  point: Point;
  hit: SmartSnapPointHit | null;
}

export function smartSnapCandidate(
  input: SmartSnapCandidateInput = {},
): SmartSnapCandidate | null {
  const raw = 'distance' in input ? input.distance : input.d;
  const distance = Number(raw);
  if (!Number.isFinite(distance)) return null;

  const guide = Number(input.guide);
  const priority = Number.isFinite(Number(input.priority))
    ? Number(input.priority)
    : SMART_SNAP_PRIORITY.object;

  const rest: Record<string, unknown> = { ...input };
  delete rest.distance;

  return {
    ...rest,
    d: distance,
    ad: Math.abs(distance),
    guide: Number.isFinite(guide) ? guide : null,
    priority,
    kind: input.kind || 'edge',
    source: input.source || 'object',
    always: Boolean(input.always),
  };
}

export function smartSnapBetter(
  current: SmartSnapCandidateInput | SmartSnapCandidate | null,
  candidate: SmartSnapCandidateInput | SmartSnapCandidate | null,
  { tolerance = SMART_SNAP_TOLERANCE }: { tolerance?: number } = {},
): SmartSnapCandidate | null {
  const next = candidate ? smartSnapCandidate(candidate) : null;
  if (!next) return current ? smartSnapCandidate(current) : null;
  if (!next.always && next.ad > tolerance) {
    return current ? smartSnapCandidate(current) : null;
  }
  if (!current) return next;

  const normalizedCurrent = smartSnapCandidate(current);
  if (!normalizedCurrent) return next;

  if (next.priority !== normalizedCurrent.priority) {
    return next.priority < normalizedCurrent.priority ? next : normalizedCurrent;
  }

  if (Math.abs(next.ad - normalizedCurrent.ad) > 0.000001) {
    return next.ad < normalizedCurrent.ad ? next : normalizedCurrent;
  }

  const rank = (hit: SmartSnapCandidate): number => {
    if (hit.kind === 'edge') return 0;
    if (hit.kind === 'center') return 1;
    if (hit.kind === 'grid') return 3;
    return 2;
  };

  return rank(next) < rank(normalizedCurrent) ? next : normalizedCurrent;
}

export function resolveSmartSnapAxes(
  candidates: readonly (SmartSnapCandidateInput | SmartSnapCandidate | null)[],
  { tolerance = SMART_SNAP_TOLERANCE }: { tolerance?: number } = {},
): SmartSnapAxes {
  let x: SmartSnapCandidate | null = null;
  let y: SmartSnapCandidate | null = null;

  candidates.forEach((candidate) => {
    if (!candidate) return;

    if (candidate.axis === 'x') {
      x = smartSnapBetter(x, candidate, { tolerance });
    } else if (candidate.axis === 'y') {
      y = smartSnapBetter(y, candidate, { tolerance });
    }
  });

  return { x, y };
}

export function smartSnapBoxAnchors(min: unknown, max: unknown): SmartSnapAnchor[] {
  const start = Number(min) || 0;
  const end = Number(max) || 0;

  return [
    { value: start, kind: 'edge' },
    { value: (start + end) / 2, kind: 'center' },
    { value: end, kind: 'edge' },
  ];
}

type SnapAnchorInput = number | SmartSnapAnchor;

function normalizeAnchor(value: SnapAnchorInput): SmartSnapAnchor {
  return typeof value === 'object'
    ? { value: Number(value.value) || 0, kind: value.kind || 'edge' }
    : { value: Number(value) || 0, kind: 'edge' };
}

export function smartSnapAxisPairs(
  moving: readonly SnapAnchorInput[],
  target: readonly SnapAnchorInput[],
  {
    axis,
    source = 'object',
    targetId = null,
    priority = SMART_SNAP_PRIORITY.object,
  }: {
    axis: SnapAxis;
    source?: string;
    targetId?: string | null;
    priority?: number;
  },
): SmartSnapCandidate[] {
  const output: SmartSnapCandidate[] = [];

  moving.map(normalizeAnchor).forEach((movingAnchor) => {
    target.map(normalizeAnchor).forEach((targetAnchor) => {
      const candidate = smartSnapCandidate({
        axis,
        distance: targetAnchor.value - movingAnchor.value,
        guide: targetAnchor.value,
        priority,
        source,
        targetId,
        kind:
          movingAnchor.kind === 'center' || targetAnchor.kind === 'center'
            ? 'center'
            : 'edge',
      });

      if (candidate) output.push(candidate);
    });
  });

  return output;
}

export function smartSnapGridAxis(
  value: unknown,
  axis: SnapAxis,
  {
    step,
    gridSnap = true,
    always = true,
  }: {
    step: unknown;
    gridSnap?: boolean;
    always?: boolean;
  },
): SmartSnapCandidate | null {
  const grid = Math.abs(Number(step) || 0);
  if (!gridSnap || grid <= 0) return null;

  const raw = Number(value) || 0;
  const target = Math.round(raw / grid) * grid;

  return smartSnapCandidate({
    axis,
    distance: target - raw,
    guide: target,
    priority: SMART_SNAP_PRIORITY.grid,
    source: 'grid',
    kind: 'grid',
    always,
  });
}

export function smartSnapPoint(
  raw: Partial<Point> | null,
  candidates: readonly (SmartSnapPointCandidate | null)[],
  {
    tolerance = SMART_SNAP_TOLERANCE,
    grid = true,
    bypass = false,
    gridSnap = true,
    gridStep = 1,
  }: {
    tolerance?: number;
    grid?: boolean;
    bypass?: boolean;
    gridSnap?: boolean;
    gridStep?: number;
  } = {},
): SmartSnapPointResult {
  const point: Point = {
    x: Number(raw?.x) || 0,
    y: Number(raw?.y) || 0,
  };

  if (bypass) return { point, hit: null };

  let best: SmartSnapPointHit | null = null;

  for (const candidate of candidates) {
    if (!candidate) continue;

    const x = Number(candidate.x);
    const y = Number(candidate.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const distance = Math.hypot(x - point.x, y - point.y);
    if (distance > tolerance) continue;

    const next: SmartSnapPointHit = {
      ...candidate,
      point: { x, y },
      d: distance,
      ad: distance,
      priority: Number.isFinite(Number(candidate.priority))
        ? Number(candidate.priority)
        : SMART_SNAP_PRIORITY.object,
    };

    if (
      !best ||
      next.priority < best.priority ||
      (next.priority === best.priority && next.d < best.d)
    ) {
      best = next;
    }
  }

  if (best) return { point: best.point, hit: best };

  if (grid && gridSnap) {
    const step = Math.abs(Number(gridStep) || 0);

    if (step > 0) {
      const gridPoint = {
        x: Math.round(point.x / step) * step,
        y: Math.round(point.y / step) * step,
      };
      const distance = Math.hypot(gridPoint.x - point.x, gridPoint.y - point.y);

      if (distance <= tolerance) {
        return {
          point: gridPoint,
          hit: {
            source: 'grid',
            kind: 'grid',
            priority: SMART_SNAP_PRIORITY.grid,
            d: distance,
            ad: distance,
            point: gridPoint,
          },
        };
      }
    }
  }

  return { point, hit: null };
}
