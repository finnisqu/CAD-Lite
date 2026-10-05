import { describe, expect, it } from 'vitest';

import {
  distancePointToSegment,
  geometryKernelInfo,
  pointSegmentDistance,
  polygonContainsPoint,
  polygonDistance,
  rotatePointAround,
  segmentIntersections,
} from '../src/geometry';

describe('CAD Lite hybrid geometry kernel experiment', () => {
  it('binds CAD Lite to the pinned Flatten.js + Clipper engine stack', () => {
    expect(geometryKernelInfo).toEqual({
      id: 'flatten-js+clipper',
      version: 'flatten-js@1.6.14+js-angusj-clipper@1.3.1',
    });
  });

  it('backs public point-to-segment distance helpers with the kernel', () => {
    const point = { x: 5, y: 3 };
    const start = { x: 0, y: 0 };
    const end = { x: 10, y: 0 };

    expect(pointSegmentDistance(point, start, end)).toBeCloseTo(3, 10);
    expect(distancePointToSegment(point, start, end)).toBeCloseTo(3, 10);
    expect(
      pointSegmentDistance(
        { x: 3, y: 4 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ),
    ).toBeCloseTo(5, 10);
  });

  it('handles polygon distance, overlap, and containment without leaking kernel shapes', () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 6, y: 10 },
      { x: 6, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ];
    const separate = [
      { x: 15, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 15, y: 10 },
    ];
    const inside = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
    ];

    expect(polygonContainsPoint(concave, { x: 2, y: 8 })).toBe(true);
    expect(polygonContainsPoint(concave, { x: 5, y: 8 })).toBe(false);
    expect(polygonDistance(concave, separate)).toBeCloseTo(5, 10);
    expect(polygonDistance(concave, inside)).toBe(0);
  });

  it('uses the kernel for point rotation with CAD Lite degree conventions', () => {
    const rotated = rotatePointAround(
      { x: 11, y: 10 },
      { x: 10, y: 10 },
      90,
    );

    expect(rotated.x).toBeCloseTo(10, 10);
    expect(rotated.y).toBeCloseTo(11, 10);
  });

  it('exposes robust segment intersection points for future snapping work', () => {
    const intersections = segmentIntersections(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    );

    expect(intersections).toHaveLength(1);
    expect(intersections[0]?.x).toBeCloseTo(5, 10);
    expect(intersections[0]?.y).toBeCloseTo(5, 10);
    expect(
      segmentIntersections(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 2 },
        { x: 10, y: 2 },
      ),
    ).toEqual([]);
  });
});
