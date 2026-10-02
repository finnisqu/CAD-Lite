import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  updateFloorPlan,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function stateWithPlan() {
  const payload = structuredClone(v159ProjectFixture);
  const layouts = payload.layouts;
  if (!Array.isArray(layouts)) throw new Error('Fixture Layout collection changed');
  const layout = layouts[0];
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    throw new Error('Fixture Layout shape changed');
  }
  layout.plan = {
    id: 'plan-parity',
    name: 'Parity Plan',
    dataURL: 'data:image/png;base64,AAAA',
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
  return applicationStateFromLegacyPayload(payload);
}

describe('Batch 58 Floor Plan geometry parity', () => {
  it('keeps 1/16-inch fine alignment independent from canvas sizing', () => {
    const store = new AppStore(stateWithPlan());
    const commands = new CommandDispatcher(store);
    const before = store.getState().project.layouts[0];
    if (!before) throw new Error('Fixture Layout missing');
    const beforePiece = before.pieces[0];
    if (!beforePiece) throw new Error('Fixture Piece missing');

    expect(
      commands.execute(
        updateFloorPlan(before.id, { offsetX: 1 / 16, offsetY: -1 / 16 }),
      ),
    ).not.toBeNull();

    const after = store.getState().project.layouts[0];
    expect(after?.plan).toMatchObject({
      offsetX: 0.0625,
      offsetY: -0.0625,
    });
    expect(after?.cw).toBe(before.cw);
    expect(after?.ch).toBe(before.ch);
    expect(after?.pieces[0]?.x).toBe(beforePiece.x);
    expect(after?.pieces[0]?.y).toBe(beforePiece.y);
  });

  it('resizes around the drawing center when Canvas Margin changes', () => {
    const store = new AppStore(stateWithPlan());
    const commands = new CommandDispatcher(store);
    const before = store.getState().project.layouts[0];
    if (!before) throw new Error('Fixture Layout missing');
    const beforePiece = before.pieces[0];
    if (!beforePiece) throw new Error('Fixture Piece missing');
    const slabPlacement = structuredClone(beforePiece.slabPlacement);
    const beforeRelativeX = beforePiece.x - before.cw / 2;
    const beforeRelativeY = beforePiece.y - before.ch / 2;

    expect(
      commands.execute(updateFloorPlan(before.id, { margin: 100 })),
    ).not.toBeNull();

    const after = store.getState().project.layouts[0];
    const afterPiece = after?.pieces[0];
    expect(after?.plan?.margin).toBe(100);
    expect(after?.cw).toBeGreaterThanOrEqual(500);
    expect(after?.ch).toBeGreaterThanOrEqual(400);
    expect(afterPiece?.x - (after?.cw ?? 0) / 2).toBeCloseTo(
      beforeRelativeX,
      3,
    );
    expect(afterPiece?.y - (after?.ch ?? 0) / 2).toBeCloseTo(
      beforeRelativeY,
      3,
    );
    expect(afterPiece?.slabPlacement).toEqual(slabPlacement);
  });
});
