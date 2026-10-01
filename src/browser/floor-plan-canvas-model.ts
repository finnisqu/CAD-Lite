import type { ReadonlyApplicationState } from '../app/state';
import { normalizeFloorPlan, type FloorPlan } from '../domain/floor-plans';

export interface FloorPlanCanvasProjection {
  layoutId: string;
  plan: FloorPlan;
  x: number;
  y: number;
  centerX: number;
  centerY: number;
}

export function createFloorPlanCanvasProjection(
  state: ReadonlyApplicationState,
): FloorPlanCanvasProjection | null {
  if (state.session.workspace !== 'design') return null;
  const layout = state.project.layouts.find(
    (item) => item.id === state.session.activeLayoutId,
  );
  if (!layout) return null;
  const plan = normalizeFloorPlan(layout.plan, 0, `${layout.id}-floor-plan`);
  if (!plan || !plan.visible || !plan.dataURL) return null;

  return {
    layoutId: layout.id,
    plan,
    x: (layout.cw - plan.w) / 2 + plan.offsetX,
    y: (layout.ch - plan.h) / 2 + plan.offsetY,
    centerX: layout.cw / 2,
    centerY: layout.ch / 2,
  };
}
