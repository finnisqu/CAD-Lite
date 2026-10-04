import { describe, expect, it } from 'vitest';

import {
  axisAlignedRectsOverlap,
  convexPolygonsOverlap,
  pointAngleDegrees,
  pointSegmentDistance,
  polygonCenter,
  polygonDistance,
  projectVectorOntoAxes,
  rectContainsPoint,
  rectContainsPolygon,
  rotateVector,
  rotatedRectBoundingSize,
  signedAngleDeltaDegrees,
  snapAngleToIncrement,
  translatePointAlongAxes,
} from '../src/geometry';

describe('core geometry', () => {
  it('rotates vectors with the v1.5.99 convention', () => {
    const rotated = rotateVector(1, 0, 90);
    expect(rotated.x).toBeCloseTo(0, 10);
    expect(rotated.y).toBeCloseTo(1, 10);
  });

  it('calculates point angles in degrees', () => {
    expect(pointAngleDegrees({ x: 10, y: 20 }, { x: 20, y: 20 })).toBeCloseTo(0, 10);
    expect(pointAngleDegrees({ x: 10, y: 20 }, { x: 10, y: 30 })).toBeCloseTo(90, 10);
    expect(pointAngleDegrees({ x: 10, y: 20 }, { x: 0, y: 20 })).toBeCloseTo(180, 10);
    expect(pointAngleDegrees({ x: 10, y: 20 }, { x: 10, y: 10 })).toBeCloseTo(-90, 10);
  });

  it('normalizes signed angle deltas with the existing rotation convention', () => {
    expect(signedAngleDeltaDegrees(0)).toBe(0);
    expect(signedAngleDeltaDegrees(181)).toBe(-179);
    expect(signedAngleDeltaDegrees(-181)).toBe(179);
    expect(signedAngleDeltaDegrees(359)).toBe(-1);
  });

  it('snaps angles to a supplied increment', () => {
    expect(snapAngleToIncrement(44, 90)).toBe(0);
    expect(snapAngleToIncrement(46, 90)).toBe(90);
    expect(snapAngleToIncrement(-46, 90)).toBe(-90);
    expect(snapAngleToIncrement(37, 0)).toBe(37);
  });

  it('projects world vectors onto rotated local axes', () => {
    const u = rotateVector(1, 0, 90);
    const v = rotateVector(0, 1, 90);
    const local = projectVectorOntoAxes({ x: 0, y: 12 }, u, v);

    expect(local.x).toBeCloseTo(12, 10);
    expect(local.y).toBeCloseTo(0, 10);
    expect(
      projectVectorOntoAxes(
        { x: -4, y: 7 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ),
    ).toEqual({ x: -4, y: 7 });
  });

  it('translates points along rotated local axes', () => {
    const u = rotateVector(1, 0, 90);
    const v = rotateVector(0, 1, 90);
    const moved = translatePointAlongAxes({ x: 10, y: 20 }, u, v, 5, -3);

    expect(moved.x).toBeCloseTo(13, 10);
    expect(moved.y).toBeCloseTo(25, 10);
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
