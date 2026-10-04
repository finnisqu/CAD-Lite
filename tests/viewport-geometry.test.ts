import { describe, expect, it } from 'vitest';

import {
  anchoredViewportScrollOffset,
  clientPointToViewportPoint,
  nextViewportScale,
  normalizeViewportScale,
  screenDistanceToWorld,
} from '../src/geometry';

describe('viewport geometry', () => {
  it('normalizes viewport scales consistently', () => {
    expect(normalizeViewportScale(8)).toBe(8);
    expect(normalizeViewportScale(-8)).toBe(8);
    expect(normalizeViewportScale(0.0001)).toBe(0.001);
    expect(normalizeViewportScale(0)).toBe(1);
    expect(normalizeViewportScale(Number.NaN)).toBe(1);
  });

  it('converts screen-space distances into world-space distances', () => {
    expect(screenDistanceToWorld(4, 8)).toBe(0.5);
    expect(screenDistanceToWorld(2, 8)).toBe(0.25);
    expect(screenDistanceToWorld(4, -8)).toBe(0.5);
  });

  it('steps a viewport scale within caller-provided bounds', () => {
    expect(nextViewportScale(6, 1, 0.5, 1, 24)).toBe(6.5);
    expect(nextViewportScale(6, -1, 0.5, 1, 24)).toBe(5.5);
    expect(nextViewportScale(24, 1, 0.5, 1, 24)).toBe(24);
    expect(nextViewportScale(1, -1, 0.5, 1, 24)).toBe(1);
  });

  it('falls back to the minimum when the current scale is not finite', () => {
    expect(nextViewportScale(Number.NaN, 1, 0.5, 1, 24)).toBe(1.5);
  });

  it('keeps the same world coordinate beneath a pointer while zooming', () => {
    const scroll = 100;
    const pointer = 50;
    const oldScale = 6;
    const newScale = 6.5;
    const nextScroll = anchoredViewportScrollOffset(
      scroll,
      pointer,
      oldScale,
      newScale,
    );

    expect((scroll + pointer) / oldScale).toBe(25);
    expect((nextScroll + pointer) / newScale).toBe(25);
  });

  it('never returns a negative scroll offset', () => {
    expect(anchoredViewportScrollOffset(0, 100, 2, 1)).toBe(0);
  });

  it('projects client coordinates into a viewport rectangle', () => {
    expect(
      clientPointToViewportPoint(
        { x: 200, y: 100 },
        { left: 100, top: 50, width: 200, height: 100 },
        { x: 0, y: 0, w: 1000, h: 500 },
      ),
    ).toEqual({ x: 500, y: 250 });
  });

  it('preserves a nonzero viewport origin during client projection', () => {
    expect(
      clientPointToViewportPoint(
        { x: 150, y: 75 },
        { left: 100, top: 50, width: 200, height: 100 },
        { x: 10, y: 20, w: 40, h: 80 },
      ),
    ).toEqual({ x: 20, y: 40 });
  });

  it('rejects client rectangles with no usable size', () => {
    expect(
      clientPointToViewportPoint(
        { x: 10, y: 10 },
        { left: 0, top: 0, width: 0, height: 100 },
        { x: 0, y: 0, w: 100, h: 100 },
      ),
    ).toBeNull();
    expect(
      clientPointToViewportPoint(
        { x: 10, y: 10 },
        { left: 0, top: 0, width: 100, height: -1 },
        { x: 0, y: 0, w: 100, h: 100 },
      ),
    ).toBeNull();
  });
});
