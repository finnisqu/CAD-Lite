import type { Point } from './types';

export function rotateVector(x: number, y: number, degrees: unknown): Point {
  const radians = (Number(degrees) || 0) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointAngleDegrees(origin: Point, point: Point): number {
  return Math.atan2(point.y - origin.y, point.x - origin.x) * 180 / Math.PI;
}

export function signedAngleDeltaDegrees(value: number): number {
  return ((value + 540) % 360) - 180;
}

export function snapAngleToIncrement(angle: number, increment: number): number {
  const step = Math.abs(Number(increment) || 0);
  if (step <= 0) return angle;
  return Math.round(angle / step) * step;
}
