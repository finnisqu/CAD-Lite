import { describe, expect, it } from 'vitest';

import {
  CLIPPER_COORDINATE_SCALE,
  geometryKernel,
  type Point,
  type PolygonRegion,
} from '../src/geometry';

function signedArea(points: readonly Point[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (!a || !b) continue;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function regionArea(region: PolygonRegion): number {
  return (
    Math.abs(signedArea(region.outer)) -
    region.holes.reduce(
      (sum, hole) => sum + Math.abs(signedArea(hole)),
      0,
    )
  );
}

function bounds(points: readonly Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return points.reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      minY: Math.min(result.minY, point.y),
      maxX: Math.max(result.maxX, point.x),
      maxY: Math.max(result.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

describe('Clipper topology engine', () => {
  it('keeps Clipper integer scaling hidden behind 0.0001-inch CAD coordinates', () => {
    expect(CLIPPER_COORDINATE_SCALE).toBe(10_000);
  });

  it('unions adjacent countertop polygons into one region', async () => {
    const left = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const right = [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ];

    const result = await geometryKernel.polygonBoolean(
      [left, right],
      [],
      'union',
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.holes).toHaveLength(0);
    expect(regionArea(result[0]!)).toBeCloseTo(200, 6);
  });

  it('subtracts a sink opening while preserving explicit hole topology', async () => {
    const countertop = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ];
    const sink = [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ];

    const result = await geometryKernel.polygonBoolean(
      [countertop],
      [sink],
      'difference',
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.holes).toHaveLength(1);
    expect(regionArea(result[0]!)).toBeCloseTo(300, 6);
  });

  it('returns the real overlap region for intersecting pieces', async () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const b = [
      { x: 5, y: 0 },
      { x: 15, y: 0 },
      { x: 15, y: 10 },
      { x: 5, y: 10 },
    ];

    const result = await geometryKernel.polygonBoolean(
      [a],
      [b],
      'intersection',
    );

    expect(result).toHaveLength(1);
    expect(regionArea(result[0]!)).toBeCloseTo(50, 6);
  });

  it('offsets a piece outline in inch units with mitered corners', async () => {
    const piece = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const result = await geometryKernel.polygonOffset([piece], 2, {
      join: 'miter',
    });

    expect(result).toHaveLength(1);
    expect(bounds(result[0]!.outer)).toEqual({
      minX: -2,
      minY: -2,
      maxX: 12,
      maxY: 12,
    });
    expect(regionArea(result[0]!)).toBeCloseTo(196, 6);
  });

  it('preserves thousandth-inch countertop coordinates through booleans', async () => {
    const precise = [
      { x: 81.997, y: 12.003 },
      { x: 91.997, y: 12.003 },
      { x: 91.997, y: 22.003 },
      { x: 81.997, y: 22.003 },
    ];

    const result = await geometryKernel.polygonBoolean([precise], [], 'union');
    const resultBounds = bounds(result[0]!.outer);

    expect(resultBounds.minX).toBeCloseTo(81.997, 4);
    expect(resultBounds.minY).toBeCloseTo(12.003, 4);
    expect(resultBounds.maxX).toBeCloseTo(91.997, 4);
    expect(resultBounds.maxY).toBeCloseTo(22.003, 4);
  });
});
