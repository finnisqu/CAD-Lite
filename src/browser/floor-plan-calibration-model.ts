import { clamp } from '../core/numeric';
import { screenDistanceToWorld } from '../geometry';

export type FloorPlanCalibrationArrowKey =
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown';

export interface FloorPlanCalibrationSquare {
  x: number;
  y: number;
  size: number;
}

export interface FloorPlanCalibrationCanvas {
  width: number;
  height: number;
  scale: number;
}

const FLOOR_PLAN_CALIBRATION_FALLBACK_SCALE = 16;

export function isFloorPlanCalibrationArrowKey(
  key: string,
): key is FloorPlanCalibrationArrowKey {
  return (
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'ArrowUp' ||
    key === 'ArrowDown'
  );
}

/**
 * v1.5.99 fine calibration nudge is screen-based rather than grid-based:
 * 1 px per Arrow key, 10 px with Shift. Layout scale is px/in.
 */
export function nudgeFloorPlanCalibrationSquare(
  square: FloorPlanCalibrationSquare,
  key: FloorPlanCalibrationArrowKey,
  shiftKey: boolean,
  canvas: FloorPlanCalibrationCanvas,
): FloorPlanCalibrationSquare {
  const pxStep = shiftKey ? 10 : 1;
  const scale = Math.abs(canvas.scale);
  const effectiveScale =
    scale > 0.000001 ? scale : FLOOR_PLAN_CALIBRATION_FALLBACK_SCALE;
  const step = screenDistanceToWorld(pxStep, effectiveScale);
  let x = square.x;
  let y = square.y;

  if (key === 'ArrowLeft') x -= step;
  else if (key === 'ArrowRight') x += step;
  else if (key === 'ArrowUp') y -= step;
  else y += step;

  return {
    ...square,
    x: clamp(x, 0, Math.max(0, canvas.width - square.size)),
    y: clamp(y, 0, Math.max(0, canvas.height - square.size)),
  };
}
