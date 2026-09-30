import { describe, expect, it } from 'vitest';

import {
  SMART_SNAP_PRIORITY,
  constrainDrawPoint,
  resolveSmartSnapAxes,
  smartSnapAxisPairs,
  smartSnapBetter,
  smartSnapBoxAnchors,
  smartSnapCandidate,
  smartSnapGridAxis,
  smartSnapPoint,
} from '../src/geometry';

describe('unified smart snapping compatibility', () => {
  it('normalizes candidate distance and defaults', () => {
    const candidate = smartSnapCandidate({
      axis: 'x',
      distance: -0.75,
      guide: 10,
      source: 'piece',
    });

    expect(candidate).toMatchObject({
      axis: 'x',
      d: -0.75,
      ad: 0.75,
      guide: 10,
      priority: SMART_SNAP_PRIORITY.object,
      kind: 'edge',
      source: 'piece',
      always: false,
    });

    expect(smartSnapCandidate({ distance: Number.NaN })).toBeNull();
  });

  it('uses priority before distance and edge before center on ties', () => {
    const lowerPriority = smartSnapCandidate({
      axis: 'x',
      distance: 0.2,
      priority: SMART_SNAP_PRIORITY.slabAlign,
      kind: 'edge',
    });

    const reference = smartSnapBetter(
      lowerPriority,
      {
        axis: 'x',
        distance: 0.9,
        priority: SMART_SNAP_PRIORITY.reference,
        kind: 'center',
      },
      { tolerance: 1 },
    );

    expect(reference?.priority).toBe(SMART_SNAP_PRIORITY.reference);

    const edgeWinsTie = smartSnapBetter(
      { axis: 'x', distance: 0.5, kind: 'center' },
      { axis: 'x', distance: 0.5, kind: 'edge' },
    );

    expect(edgeWinsTie?.kind).toBe('edge');
  });

  it('respects tolerance unless a candidate is marked always', () => {
    expect(
      smartSnapBetter(null, { axis: 'x', distance: 2 }, { tolerance: 1 }),
    ).toBeNull();

    expect(
      smartSnapBetter(null, { axis: 'x', distance: 2, always: true }, { tolerance: 1 })?.d,
    ).toBe(2);
  });

  it('resolves x and y independently', () => {
    const resolved = resolveSmartSnapAxes([
      { axis: 'x', distance: 0.8, guide: 5, source: 'piece' },
      { axis: 'x', distance: 0.2, guide: 6, source: 'piece' },
      { axis: 'y', distance: -0.4, guide: 7, source: 'roomFeature' },
    ]);

    expect(resolved.x?.guide).toBe(6);
    expect(resolved.y?.guide).toBe(7);
  });

  it('builds edge/center anchors and pair candidates', () => {
    expect(smartSnapBoxAnchors(0, 10)).toEqual([
      { value: 0, kind: 'edge' },
      { value: 5, kind: 'center' },
      { value: 10, kind: 'edge' },
    ]);

    const pairs = smartSnapAxisPairs(
      [{ value: 5, kind: 'center' }],
      [{ value: 8, kind: 'edge' }],
      { axis: 'x', targetId: 'piece-2' },
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      axis: 'x',
      d: 3,
      guide: 8,
      kind: 'center',
      targetId: 'piece-2',
    });
  });

  it('creates grid-axis candidates only when grid snapping is enabled', () => {
    expect(smartSnapGridAxis(4.6, 'x', { step: 1 })?.d).toBeCloseTo(0.4, 10);
    expect(smartSnapGridAxis(4.6, 'x', { step: 1, gridSnap: false })).toBeNull();
    expect(smartSnapGridAxis(4.6, 'x', { step: 0 })).toBeNull();
  });

  it('prefers object point snaps over grid and falls back to grid', () => {
    const objectResult = smartSnapPoint(
      { x: 9.4, y: 9.4 },
      [{ x: 10, y: 10, priority: SMART_SNAP_PRIORITY.object, source: 'piece' }],
      { tolerance: 1, gridStep: 1 },
    );

    expect(objectResult.point).toEqual({ x: 10, y: 10 });
    expect(objectResult.hit?.source).toBe('piece');

    const gridResult = smartSnapPoint(
      { x: 2.49, y: 3.51 },
      [],
      { tolerance: 1, gridStep: 1 },
    );

    expect(gridResult.point).toEqual({ x: 2, y: 4 });
    expect(gridResult.hit?.source).toBe('grid');
  });

  it('preserves the raw point when bypass is active', () => {
    expect(
      smartSnapPoint(
        { x: 2.49, y: 3.51 },
        [{ x: 2, y: 4 }],
        { bypass: true, gridStep: 1 },
      ),
    ).toEqual({
      point: { x: 2.49, y: 3.51 },
      hit: null,
    });
  });
});

describe('drawing constraint compatibility', () => {
  it('auto-straightens within the existing 3 degree threshold', () => {
    const start = { x: 0, y: 0 };
    const inside = {
      x: 100,
      y: Math.tan(2.9 * Math.PI / 180) * 100,
    };
    const outside = {
      x: 100,
      y: Math.tan(3.1 * Math.PI / 180) * 100,
    };

    expect(constrainDrawPoint(start, inside)).toEqual({ x: inside.x, y: 0 });
    expect(constrainDrawPoint(start, outside)).toEqual(outside);
  });

  it('uses force mode as the strong nearest-axis constraint', () => {
    expect(constrainDrawPoint({ x: 0, y: 0 }, { x: 5, y: 20 }, true)).toEqual({
      x: 0,
      y: 20,
    });
  });
});
