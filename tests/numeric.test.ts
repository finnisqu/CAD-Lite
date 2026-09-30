import { describe, expect, it } from 'vitest';

import { clamp, format3, normalizeDegrees, round3 } from '../src/core/numeric';

describe('numeric compatibility helpers', () => {
  it('clamps values to the inclusive range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
  });

  it('preserves v1.5.99 three-decimal rounding semantics', () => {
    expect(round3(81.9974)).toBe(81.997);
    expect(round3(81.9976)).toBe(81.998);
    expect(round3('12.3456')).toBe(12.346);
    expect(round3(Number.NaN)).toBe(0);
  });

  it('formats compact decimal values', () => {
    expect(format3(12)).toBe('12');
    expect(format3(12.5)).toBe('12.5');
    expect(format3(12.3456)).toBe('12.346');
  });

  it('normalizes degrees to [0, 360)', () => {
    expect(normalizeDegrees(450)).toBe(90);
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(-720)).toBe(0);
  });
});
