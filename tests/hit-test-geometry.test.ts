import { describe, expect, it } from 'vitest';

import {
  distancePointToSegment,
  rotatePointAround,
  rotatedRectBounds,
} from '../src/geometry';

describe('canvas hit-test geometry', () => {
  it('measures the shortest distance to a finite segment', () => {
    expect(
      distancePointToSegment(
        { x: 5, y: 3 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ),
    ).toBe(3);
    expect(
      distancePointToSegment(
        { x: 12, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ),
    ).toBe(2);
  });

  it('handles a degenerate segment as a point', () => {
    expect(
      distancePointToSegment(
        { x: 3, y: 4 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ),
    ).toBe(5);
  });

  it('rotates a point around an arbitrary center', () => {
    const rotated = rotatePointAround(
      { x: 12, y: 10 },
      { x: 10, y: 10 },
      90,
    );
    expect(rotated.x).toBeCloseTo(10, 10);
    expect(rotated.y).toBeCloseTo(12, 10);
  });

  it('returns axis-aligned bounds for a centered rotated rectangle', () => {
    const bounds = rotatedRectBounds(
      { x: 10, y: 20, w: 40, h: 10 },
      90,
    );
    expect(bounds.x).toBeCloseTo(25, 10);
    expect(bounds.y).toBeCloseTo(5, 10);
    expect(bounds.w).toBeCloseTo(10, 10);
    expect(bounds.h).toBeCloseTo(40, 10);
  });
});
