/**
 * Numeric helpers ported from the v1.5.99 behavioral baseline.
 *
 * Keep coercion/rounding semantics stable while the legacy runtime is migrated.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function round3(value: unknown): number {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

export function format3(value: unknown): string {
  const rounded = round3(value);
  return Math.abs(rounded % 1) < 1e-9
    ? String(Math.round(rounded))
    : rounded.toFixed(3).replace(/\.?0+$/, '');
}

export function normalizeDegrees(value: unknown): number {
  return (((Number(value) || 0) % 360) + 360) % 360;
}
