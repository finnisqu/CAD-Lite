export type InchFormat = 'fraction' | 'decimal';
export type InchPrecision = 1 | 2 | 4 | 8 | 16;

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/**
 * Format a positive/negative inch value with the same display contract used by
 * the production canvas: decimal values trim trailing zeroes; fractional values
 * reduce against the configured denominator.
 */
export function formatCanvasInches(
  value: number,
  format: InchFormat,
  precision: InchPrecision,
): string {
  const numeric = Number(value) || 0;
  const sign = numeric < 0 ? '-' : '';
  const absolute = Math.abs(numeric);
  const rounded = Math.round(absolute * 1000) / 1000;

  if (format === 'decimal') {
    const text =
      Math.abs(rounded % 1) < 1e-9
        ? String(Math.round(rounded))
        : rounded.toFixed(3).replace(/\.?0+$/, '');
    return sign + text + '"';
  }

  let whole = Math.floor(absolute);
  let numerator = Math.round((absolute - whole) * precision);
  if (numerator === precision) {
    whole += 1;
    numerator = 0;
  }
  if (numerator === 0) return sign + String(whole) + '"';

  const factor = gcd(numerator, precision);
  return (
    sign +
    (whole ? String(whole) + ' ' : '') +
    String(numerator / factor) +
    '/' +
    String(precision / factor) +
    '"'
  );
}

export function formatRadiusLabel(
  radius: number,
  format: InchFormat,
  precision: InchPrecision,
): string {
  return `R${formatCanvasInches(radius, format, precision)}`;
}
