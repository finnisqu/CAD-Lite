import { describe, expect, it } from 'vitest';

import {
  nextProductionCanvasScale,
  resolveProductionTheme,
} from '../src/browser';

describe('production viewport helpers', () => {
  it('steps zoom in production 0.5 px/in increments', () => {
    expect(nextProductionCanvasScale(6, 1)).toBe(6.5);
    expect(nextProductionCanvasScale(6, -1)).toBe(5.5);
  });

  it('clamps zoom to the v1.5.99 production range', () => {
    expect(nextProductionCanvasScale(24, 1)).toBe(24);
    expect(nextProductionCanvasScale(1, -1)).toBe(1);
  });

  it('resolves Light, Dark, and System appearance choices', () => {
    expect(resolveProductionTheme('light', true)).toBe('light');
    expect(resolveProductionTheme('dark', false)).toBe('dark');
    expect(resolveProductionTheme('system', true)).toBe('dark');
    expect(resolveProductionTheme('system', false)).toBe('light');
  });
});
