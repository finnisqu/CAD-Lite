import {
  calibrateFloorPlan,
  normalizeFloorPlan,
  type FloorPlan,
  type FloorPlanPatch,
} from '../../domain/floor-plans';
import { syncLayoutCanvasToFloorPlan } from '../../domain/floor-plans/layout-sync';
import type { Layout } from '../../domain/project';
import type { ReadonlyApplicationState } from '../state';
import type { AppCommand } from './types';

function designLayout(
  state: ReadonlyApplicationState,
  layoutId: string,
): { layout: Layout; index: number } | null {
  if (
    state.session.workspace !== 'design' ||
    state.session.activeLayoutId !== layoutId
  ) {
    return null;
  }
  const index = state.project.layouts.findIndex(
    (layout) => layout.id === layoutId,
  );
  const layout = state.project.layouts[index];
  return index >= 0 && layout ? { layout, index } : null;
}

function replaceLayout(
  state: ReadonlyApplicationState,
  index: number,
  layout: Layout,
) {
  const layouts = [...state.project.layouts];
  layouts[index] = layout;
  return {
    ...state,
    project: { ...state.project, layouts },
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function patchChangesCanvasSize(patch: FloorPlanPatch): boolean {
  return (
    'w' in patch ||
    'h' in patch ||
    'rotation' in patch ||
    'margin' in patch
  );
}

export function setFloorPlan(
  layoutId: string,
  plan: FloorPlan,
): AppCommand {
  return {
    type: 'floorPlan.set',
    label: 'Set floor plan',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (!target) return state;
      const next = normalizeFloorPlan(plan, 0, `${layoutId}-floor-plan`);
      if (!next) return state;
      const withPlan: Layout = { ...target.layout, plan: next };
      const synced = syncLayoutCanvasToFloorPlan(withPlan, next);
      if (sameJson(target.layout, synced)) return state;
      return replaceLayout(state, target.index, synced);
    },
  };
}

export function updateFloorPlan(
  layoutId: string,
  patch: FloorPlanPatch,
): AppCommand {
  return {
    type: 'floorPlan.update',
    label: 'Update floor plan',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (!target) return state;
      const current = normalizeFloorPlan(
        target.layout.plan,
        0,
        `${layoutId}-floor-plan`,
      );
      if (!current) return state;
      const next = normalizeFloorPlan(
        { ...current, ...patch, id: current.id },
        0,
        `${layoutId}-floor-plan`,
      );
      if (!next || sameJson(current, next)) return state;
      const withPlan: Layout = { ...target.layout, plan: next };
      const layout = patchChangesCanvasSize(patch)
        ? syncLayoutCanvasToFloorPlan(withPlan, next)
        : withPlan;
      return replaceLayout(state, target.index, layout);
    },
  };
}

export function calibrateFloorPlanDistance(
  layoutId: string,
  measuredDistance: number,
  knownDistance: number,
  updatedAt?: string,
): AppCommand {
  return {
    type: 'floorPlan.calibrate',
    label: 'Calibrate floor plan',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (!target) return state;
      const current = normalizeFloorPlan(
        target.layout.plan,
        0,
        `${layoutId}-floor-plan`,
      );
      if (!current || current.locked) return state;
      const next = calibrateFloorPlan(
        current,
        measuredDistance,
        knownDistance,
        updatedAt,
      );
      if (sameJson(current, next)) return state;
      const withPlan: Layout = { ...target.layout, plan: next };
      return replaceLayout(
        state,
        target.index,
        syncLayoutCanvasToFloorPlan(withPlan, next),
      );
    },
  };
}

export function clearFloorPlan(layoutId: string): AppCommand {
  return {
    type: 'floorPlan.clear',
    label: 'Clear floor plan',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (!target || target.layout.plan === null) return state;
      return replaceLayout(state, target.index, {
        ...target.layout,
        plan: null,
      });
    },
  };
}
