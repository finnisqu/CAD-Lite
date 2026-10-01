import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  clearFloorPlan,
  setFloorPlan,
  setWorkspace,
  updateFloorPlan,
} from '../src/app';
import {
  calibrateFloorPlan,
  createFloorPlan,
  floorPlanCanvasSize,
  normalizeFloorPlan,
} from '../src/domain/floor-plans';
import { createFloorPlanCanvasProjection } from '../src/browser/floor-plan-canvas-model';
import { v159ProjectFixture } from './fixtures/v159-project';

function payloadWithPlan() {
  const payload = structuredClone(v159ProjectFixture);
  const layout = payload.layouts?.[0];
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    throw new Error('Fixture Layout shape changed');
  }
  layout.plan = {
    id: 'plan-kitchen',
    name: 'Kitchen Plan',
    dataURL: 'data:image/webp;base64,AAAA',
    natW: 2400,
    natH: 1600,
    w: 300,
    h: 200,
    opacity: 0.4,
    visible: true,
    grayscale: false,
    flipX: false,
    flipY: false,
    rotation: 0,
    calibrated: false,
    calibration: null,
    locked: false,
    includeInExport: false,
    margin: 6,
    offsetX: 0,
    offsetY: 0,
  };
  if (!payload.ui || typeof payload.ui !== 'object' || Array.isArray(payload.ui)) {
    throw new Error('Fixture UI shape changed');
  }
  payload.ui.workspace = 'layout';
  payload.active = 0;
  return payload;
}

function designState() {
  return applicationStateFromLegacyPayload(payloadWithPlan());
}

describe('Batch 25 typed Floor Plan domain', () => {
  it('normalizes the exact v1.5.99 Floor Plan display contract', () => {
    const plan = normalizeFloorPlan({
      id: 'p',
      dataURL: 'data:image/png;base64,x',
      opacity: 9,
      rotation: -90,
      calibrated: true,
    });

    expect(plan).toMatchObject({
      id: 'p',
      name: 'Floor Plan',
      opacity: 1,
      rotation: 270,
      visible: true,
      calibrated: true,
      locked: true,
      includeInExport: false,
      w: 300,
      h: 200,
      margin: 0,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('creates prepared plans with v1.5.99 import defaults', () => {
    const plan = createFloorPlan({
      id: 'new-plan',
      name: 'Level 1.pdf',
      dataURL: 'data:image/webp;base64,x',
      natW: 2000,
      natH: 1000,
    });

    expect(plan).toMatchObject({
      w: 300,
      h: 150,
      opacity: 0.4,
      margin: 6,
      calibrated: false,
      locked: false,
      includeInExport: false,
    });
  });

  it('computes rotated plan canvas bounds including margin', () => {
    const plan = createFloorPlan({
      id: 'bounds',
      dataURL: 'data:image/png;base64,x',
      natW: 300,
      natH: 200,
      w: 300,
      h: 200,
    });
    const rotated = normalizeFloorPlan({ ...plan, rotation: 90, margin: 6 });
    expect(floorPlanCanvasSize(rotated!)).toEqual({ w: 212, h: 312 });
  });

  it('calibrates uniformly and locks the result', () => {
    const plan = createFloorPlan({
      id: 'cal',
      dataURL: 'data:image/png;base64,x',
      natW: 1000,
      natH: 500,
    });
    const calibrated = calibrateFloorPlan(plan, 20, 24, '2026-10-01T00:00:00.000Z');
    expect(calibrated.w).toBe(360);
    expect(calibrated.h).toBe(180);
    expect(calibrated.calibrated).toBe(true);
    expect(calibrated.locked).toBe(true);
    expect(calibrated.calibration).toMatchObject({ factor: 1.2, knownDistance: 24 });
  });
});

describe('Batch 25 Floor Plan commands and projection', () => {
  it('projects the active Layout plan behind the DESIGN canvas', () => {
    const projection = createFloorPlanCanvasProjection(designState());
    expect(projection).toMatchObject({
      layoutId: 'layout-kitchen',
      x: 0,
      y: 0,
      centerX: 150,
      centerY: 100,
    });
    expect(projection?.plan.name).toBe('Kitchen Plan');
  });

  it('updates and clears the plan through typed history-recording commands', () => {
    const store = new AppStore(designState());
    const commands = new CommandDispatcher(store);
    const layoutId = 'layout-kitchen';

    expect(commands.execute(updateFloorPlan(layoutId, { opacity: 0.7, flipX: true }))).not.toBeNull();
    expect(normalizeFloorPlan(store.getState().project.layouts[0]?.plan)).toMatchObject({
      opacity: 0.7,
      flipX: true,
    });

    expect(commands.execute(clearFloorPlan(layoutId))).not.toBeNull();
    expect(store.getState().project.layouts[0]?.plan).toBeNull();
  });

  it('sets a prepared replacement as one canonical command', () => {
    const store = new AppStore(designState());
    const commands = new CommandDispatcher(store);
    const plan = createFloorPlan({
      id: 'replacement',
      name: 'Replacement',
      dataURL: 'data:image/jpeg;base64,x',
      natW: 1200,
      natH: 800,
    });
    expect(commands.execute(setFloorPlan('layout-kitchen', plan))).not.toBeNull();
    expect(normalizeFloorPlan(store.getState().project.layouts[0]?.plan)?.id).toBe('replacement');
  });

  it('keeps plan mutation and projection inert in SLAB', () => {
    const store = new AppStore(designState());
    const commands = new CommandDispatcher(store);
    commands.execute(setWorkspace('slab'));
    expect(commands.execute(updateFloorPlan('layout-kitchen', { opacity: 0.9 }))).toBeNull();
    expect(createFloorPlanCanvasProjection(store.getState())).toBeNull();
  });
});
