import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  calibrateFloorPlanDistance,
  calibrateFloorPlanSquare,
  clearFloorPlan,
  setFloorPlan,
  setWorkspace,
  updateFloorPlan,
} from '../src/app';
import {
  calibrateFloorPlan,
  calibrateFloorPlanSquare24,
  createFloorPlan,
  floorPlanCanvasSize,
  normalizeFloorPlan,
  syncLayoutCanvasToFloorPlan,
} from '../src/domain/floor-plans';
import { createFloorPlanCanvasProjection } from '../src/browser/floor-plan-canvas-model';
import { v159ProjectFixture } from './fixtures/v159-project';

function payloadWithPlan() {
  const payload = structuredClone(v159ProjectFixture);
  const layouts = payload.layouts;
  if (!Array.isArray(layouts)) {
    throw new Error('Fixture Layout collection changed');
  }
  const layout = layouts[0];
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
    expect(rotated).not.toBeNull();
    if (!rotated) throw new Error('Floor Plan normalization failed');
    expect(floorPlanCanvasSize(rotated)).toEqual({ w: 212, h: 312 });
  });

  it('calibrates uniformly and locks the result', () => {
    const plan = createFloorPlan({
      id: 'cal',
      dataURL: 'data:image/png;base64,x',
      natW: 1000,
      natH: 500,
    });
    const calibrated = calibrateFloorPlan(
      plan,
      20,
      24,
      '2026-10-01T00:00:00.000Z',
    );
    expect(calibrated.w).toBe(360);
    expect(calibrated.h).toBe(180);
    expect(calibrated.calibrated).toBe(true);
    expect(calibrated.locked).toBe(true);
    expect(calibrated.calibration).toMatchObject({
      factor: 1.2,
      knownDistance: 24,
    });
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

    expect(
      commands.execute(
        updateFloorPlan(layoutId, { opacity: 0.7, flipX: true }),
      ),
    ).not.toBeNull();
    expect(
      normalizeFloorPlan(store.getState().project.layouts[0]?.plan),
    ).toMatchObject({
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
    expect(
      normalizeFloorPlan(store.getState().project.layouts[0]?.plan)?.id,
    ).toBe('replacement');
  });

  it('keeps plan mutation and projection inert in SLAB', () => {
    const store = new AppStore(designState());
    const commands = new CommandDispatcher(store);
    commands.execute(setWorkspace('slab'));
    expect(
      commands.execute(updateFloorPlan('layout-kitchen', { opacity: 0.9 })),
    ).toBeNull();
    expect(createFloorPlanCanvasProjection(store.getState())).toBeNull();
  });
});

describe('Batch 26 Floor Plan preparation and calibration foundation', () => {
  it('preserves drawing offsets from canvas center while keeping SLAB poses fixed', () => {
    const state = designState();
    const layout = state.project.layouts[0];
    if (!layout) throw new Error('Fixture Layout missing');
    const piece = layout.pieces[0];
    if (!piece) throw new Error('Fixture Piece missing');
    const originalSlabPose = structuredClone(piece.slabPlacement);
    const plan = createFloorPlan({
      id: 'large-plan',
      dataURL: 'data:image/png;base64,x',
      natW: 1600,
      natH: 1000,
      w: 400,
      h: 250,
    });
    plan.margin = 0;

    const synced = syncLayoutCanvasToFloorPlan(layout, plan);
    expect(synced.cw).toBe(400);
    expect(synced.ch).toBe(250);
    expect(synced.pieces[0]?.x).toBeCloseTo(piece.x + 50, 3);
    expect(synced.pieces[0]?.y).toBeCloseTo(piece.y + 25, 3);
    expect(synced.pieces[0]?.slabPlacement).toEqual(originalSlabPose);
    expect(synced.dims[0]?.x1).toBeCloseTo(layout.dims[0]!.x1 + 50, 3);
    expect(synced.notes[0]?.y).toBeCloseTo(layout.notes[0]!.y + 25, 3);
    expect(synced.roomFeatures[0]?.x).toBeCloseTo(
      layout.roomFeatures[0]!.x + 50,
      3,
    );
  });

  it('stores production-compatible 24-inch square calibration metadata', () => {
    const plan = createFloorPlan({
      id: 'square-plan',
      dataURL: 'data:image/png;base64,x',
      natW: 1000,
      natH: 500,
    });
    const calibrated = calibrateFloorPlanSquare24(
      plan,
      30,
      '2026-10-01T01:00:00.000Z',
    );
    expect(calibrated.w).toBe(240);
    expect(calibrated.h).toBe(120);
    expect(calibrated.locked).toBe(true);
    expect(calibrated.calibration).toMatchObject({
      mode: 'square24',
      knownWidth: 24,
      knownHeight: 24,
      measuredDistance: 30,
      factor: 0.8,
    });
  });

  it('calibrates by known distance and resizes the Layout in one command', () => {
    const store = new AppStore(designState());
    const commands = new CommandDispatcher(store);
    expect(
      commands.execute(
        calibrateFloorPlanDistance(
          'layout-kitchen',
          200,
          100,
          '2026-10-01T02:00:00.000Z',
        ),
      ),
    ).not.toBeNull();
    const layout = store.getState().project.layouts[0];
    expect(layout?.plan).toMatchObject({
      w: 150,
      h: 100,
      calibrated: true,
      locked: true,
    });
    expect(layout?.cw).toBeGreaterThanOrEqual(150);
  });

  it('commits 24-inch square calibration through the typed command boundary', () => {
    const store = new AppStore(designState());
    const commands = new CommandDispatcher(store);
    expect(
      commands.execute(
        calibrateFloorPlanSquare(
          'layout-kitchen',
          30,
          '2026-10-01T03:00:00.000Z',
        ),
      ),
    ).not.toBeNull();
    const plan = store.getState().project.layouts[0]?.plan;
    expect(plan?.locked).toBe(true);
    expect(plan?.calibration).toMatchObject({
      mode: 'square24',
      factor: 0.8,
    });
  });
});
