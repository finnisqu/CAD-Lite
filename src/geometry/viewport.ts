export function nextViewportScale(
  current: number,
  direction: -1 | 1,
  step: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number.isFinite(current) ? current : minimum;
  return Math.max(minimum, Math.min(maximum, value + direction * step));
}

export function anchoredViewportScrollOffset(
  scrollOffset: number,
  localPointer: number,
  oldScale: number,
  newScale: number,
): number {
  const safeOldScale = Math.max(0.001, Math.abs(oldScale || 1));
  const worldCoordinate = (scrollOffset + localPointer) / safeOldScale;
  return Math.max(0, worldCoordinate * newScale - localPointer);
}
