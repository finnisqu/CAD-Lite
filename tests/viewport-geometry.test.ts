import { describe, expect, it } from 'vitest';

import {
  anchoredViewportScrollOffset,
  nextViewportScale,
} from '../src/geometry';

describe('viewport geometry', () => {
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
});
