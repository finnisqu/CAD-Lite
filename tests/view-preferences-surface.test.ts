import { describe, expect, it } from 'vitest';

import {
  dimensionFormatFromControl,
  dimensionPrecisionFromControl,
} from '../src/browser/view-preferences-surface';

describe('number format preference controls', () => {
  it('accepts the supported dimension formats', () => {
    expect(dimensionFormatFromControl('fraction')).toBe('fraction');
    expect(dimensionFormatFromControl('decimal')).toBe('decimal');
    expect(dimensionFormatFromControl('other')).toBeNull();
  });

  it('accepts only supported fractional precisions', () => {
    expect(dimensionPrecisionFromControl('1')).toBe(1);
    expect(dimensionPrecisionFromControl('2')).toBe(2);
    expect(dimensionPrecisionFromControl('4')).toBe(4);
    expect(dimensionPrecisionFromControl('8')).toBe(8);
    expect(dimensionPrecisionFromControl('16')).toBe(16);
    expect(dimensionPrecisionFromControl('3')).toBeNull();
    expect(dimensionPrecisionFromControl('0')).toBeNull();
    expect(dimensionPrecisionFromControl('abc')).toBeNull();
  });
});
