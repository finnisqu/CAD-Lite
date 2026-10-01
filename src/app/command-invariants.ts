import { formatRadiusLabel } from '../core/format-inches';
import { synchronizeRadiusAnnotations } from '../domain/annotations/radius';
import type { ApplicationState } from './state';

/**
 * Relationships that depend on other domain geometry are finalized here so the
 * visible/persisted result is part of the same command history entry that
 * changed the source geometry.
 */
export function synchronizeCommandInvariants(
  state: ApplicationState,
): ApplicationState {
  const formatRadius = (radius: number): string =>
    formatRadiusLabel(
      radius,
      state.preferences.dimFormat,
      state.preferences.dimPrecision,
    );

  let changed = false;
  const layouts = state.project.layouts.map((layout) => {
    const next = synchronizeRadiusAnnotations(layout, formatRadius);
    if (next !== layout) changed = true;
    return next;
  });

  return changed
    ? {
        ...state,
        project: {
          ...state.project,
          layouts,
        },
      }
    : state;
}
