import { describe, expect, it } from 'vitest';

import {
  axisAlignedRectsOverlap,
  convexPolygonsOverlap,
  pointSegmentDistance,
  polygonCenter,
  polygonDistance,
  rectContainsPoint,
  rectContainsPolygon,
  rotateVector,
  rotatedRectBoundingSize,
} from '../src/geometry';

describe('core geometry', () => {
  it('rotates vectors with the v1.5.99 convention', () => {
    const rotated = rotateVector(1, 0, 90);
    expect(rotated.x).toBeCloseTo(0, 10);
    expect(rotated.y).toBeCloseTo(1, 10);
  });

  it('calculates rotated rectangle bounding-box size', () => {
    expect(rotatedRectBoundingSize({ w: 40, h: 20, rotation: 0 })).toEqual({
      w: 40,
      h: 20,
    });

    const quarterTurn = rotatedRectBoundingSize({ w: 40, h: 20, rotation: 90 });
    expect(quarterTurn.w).toBeCloseTo(20, 10);
    expect(quarterTurn.h).toBeCloseTo(40, 10);

    const diagonal = rotatedRectBoundingSize({ w: 40, h: 20, rotation: 45 });
    expect(diagonal.w).toBeCloseTo(42.426406871, 8);
    expect(diagonal.h).toBeCloseTo(42.426406871, 8);
  });

  it('treats touching axis-aligned rectangles as non-overlapping', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const touching = { x: 10, y: 0, w: 5, h: 5 };
    const near = { x: 10.5, y: 0, w: 5, h: 5 };

    expect(axisAlignedRectsOverlap(a, touching)).toBe(false);
    expect(axisAlignedRectsOverlap(a, near, 1)).toBe(true);
    expect(axisAlignedRectsOverlap(a, { x: 11, y: 0, w: 5, h: 5 }, 1)).toBe(false);
  });

  it('checks rectangle containment with epsilon', () => {
    const rect = { left: 0, top: 0, right: 10, bottom: 10 };

    expect(rectContainsPoint(rect, { x: 10.0005, y: 5 })).toBe(true);
    expect(rectContainsPoint(rect, { x: 10.01, y: 5 })).toBe(false);
    expect(
      rectContainsPolygon(rect, [
        { x: 1, y: 1 },
        { x: 9, y: 1 },
        { x: 9, y: 9 },
        { x: 1, y: 9 },
      ]),
    ).toBe(true);
  });

  it('uses SAT semantics where touching convex polygons are allowed', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const overlapping = [
      { x: 9, y: 0 },
      { x: 15, y: 0 },
      { x: 15, y: 10 },
      { x: 9, y: 10 },
    ];
    const touching = [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ];

    expect(convexPolygonsOverlap(a, overlapping)).toBe(true);
    expect(convexPolygonsOverlap(a, touching)).toBe(false);
  });

  it('computes polygon centers and distances', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const b = [
      { x: 15, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 15, y: 10 },
    ];

    expect(polygonCenter(a)).toEqual({ x: 5, y: 5 });
    expect(polygonDistance(a, b)).toBeCloseTo(5, 10);
  });

  it('handles degenerate and projected segment distances', () => {
    expect(pointSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
    expect(pointSegmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });
});
