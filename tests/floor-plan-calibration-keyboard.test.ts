import { describe, expect, it } from 'vitest';

import {
  isFloorPlanCalibrationArrowKey,
  nudgeFloorPlanCalibrationSquare,
} from '../src/browser/floor-plan-calibration-model';

describe('Floor Plan square calibration keyboard parity', () => {
  it('nudges exactly one screen pixel at the active px/in scale', () => {
    const square = nudgeFloorPlanCalibrationSquare(
      { x: 10, y: 20, size: 24 },
      'ArrowRight',
      false,
      { width: 300, height: 200, scale: 8 },
    );

    expect(square).toEqual({ x: 10.125, y: 20, size: 24 });
  });

  it('uses a ten-pixel fine nudge while Shift is held', () => {
    const square = nudgeFloorPlanCalibrationSquare(
      { x: 10, y: 20, size: 24 },
      'ArrowUp',
      true,
      { width: 300, height: 200, scale: 4 },
    );

    expect(square).toEqual({ x: 10, y: 17.5, size: 24 });
  });

  it('preserves the production 16 px/in fallback for unusable scales', () => {
    const zeroScale = nudgeFloorPlanCalibrationSquare(
      { x: 10, y: 20, size: 24 },
      'ArrowRight',
      false,
      { width: 300, height: 200, scale: 0 },
    );
    const tinyScale = nudgeFloorPlanCalibrationSquare(
      { x: 10, y: 20, size: 24 },
      'ArrowDown',
      true,
      { width: 300, height: 200, scale: 0.0000001 },
    );

    expect(zeroScale).toEqual({ x: 10.0625, y: 20, size: 24 });
    expect(tinyScale).toEqual({ x: 10, y: 20.625, size: 24 });
  });

  it('clamps the calibration square inside the DESIGN canvas', () => {
    const right = nudgeFloorPlanCalibrationSquare(
      { x: 75.9, y: 10, size: 24 },
      'ArrowRight',
      true,
      { width: 100, height: 80, scale: 4 },
    );
    const up = nudgeFloorPlanCalibrationSquare(
      { x: 3, y: 0.1, size: 24 },
      'ArrowUp',
      true,
      { width: 100, height: 80, scale: 4 },
    );

    expect(right.x).toBe(76);
    expect(up.y).toBe(0);
  });

  it('recognizes only the four production calibration arrow keys', () => {
    expect(isFloorPlanCalibrationArrowKey('ArrowLeft')).toBe(true);
    expect(isFloorPlanCalibrationArrowKey('ArrowDown')).toBe(true);
    expect(isFloorPlanCalibrationArrowKey('Enter')).toBe(false);
    expect(isFloorPlanCalibrationArrowKey('a')).toBe(false);
  });
});
