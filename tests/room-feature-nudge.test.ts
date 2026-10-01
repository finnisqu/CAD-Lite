import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  RoomFeatureNudgeController,
  addRoomFeature,
  applicationStateFromLegacyPayload,
  setActiveLayout,
  setSelection,
  setWorkspace,
  updateRoomFeature,
} from '../src/app';
import { createRoomFeature } from '../src/domain/room-features';
import { createRoomFeatureCanvasProjection } from '../src/browser/room-feature-canvas-model';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(structuredClone(v159ProjectFixture)),
  );
  const commands = new CommandDispatcher(store);
  commands.execute(setActiveLayout('layout-kitchen'));
  commands.execute(setWorkspace('design'));
  const layout = store.getState().project.layouts[0]!;
  commands.execute(
    updateRoomFeature(layout.id, 'room-1', { groupId: 'room-group-1' }),
  );
  commands.execute(
    addRoomFeature(
      layout.id,
      createRoomFeature('room-2', 'base', {
        name: 'Partner Cabinet',
        x: 90,
        y: 100,
        length: 30,
        depth: 24,
        groupId: 'room-group-1',
      }),
    ),
  );
  commands.execute(setSelection({ kind: 'roomFeature', id: 'room-1' }));
  return {
    store,
    controller: new RoomFeatureNudgeController(store, commands),
  };
}

describe('Batch 31 Room Feature keyboard nudge parity', () => {
  it('previews one-grid movement and commits the complete Room Feature group on key-up', () => {
    const { store, controller } = setup();
    const before = store.getState().project.layouts[0]!;
    expect(before.roomFeatures.find((item) => item.id === 'room-1')?.x).toBe(40);
    expect(before.roomFeatures.find((item) => item.id === 'room-2')?.x).toBe(90);

    expect(controller.nudgeKeyDown('ArrowRight')).toBe(true);

    // Persisted geometry remains unchanged until the gesture commits.
    expect(store.getState().project.layouts[0]!.roomFeatures[0]?.x).toBe(40);
    const preview = createRoomFeatureCanvasProjection(store.getState());
    expect(preview.items.find((item) => item.id === 'room-1')?.x).toBe(41);
    expect(preview.items.find((item) => item.id === 'room-2')?.x).toBe(91);

    expect(controller.nudgeKeyUp('ArrowRight')).toBe(true);

    const after = store.getState().project.layouts[0]!;
    expect(after.roomFeatures.find((item) => item.id === 'room-1')?.x).toBe(41);
    expect(after.roomFeatures.find((item) => item.id === 'room-2')?.x).toBe(91);
    expect(store.getState().session.interaction.preview).toBeNull();
  });

  it('uses four grid increments while Shift is held', () => {
    const { store, controller } = setup();

    expect(controller.nudgeKeyDown('ArrowDown', true)).toBe(true);
    expect(controller.nudgeKeyUp('ArrowDown')).toBe(true);

    const layout = store.getState().project.layouts[0]!;
    expect(layout.roomFeatures.find((item) => item.id === 'room-1')?.y).toBe(104);
    expect(layout.roomFeatures.find((item) => item.id === 'room-2')?.y).toBe(104);
  });

  it('does not nudge Room Features outside DESIGN', () => {
    const { store, controller } = setup();
    // setWorkspace preserves only Piece selection, so restore the Room Feature
    // selection to prove the workspace guard is authoritative.
    const commands = new CommandDispatcher(store);
    commands.execute(setWorkspace('slab'));
    commands.execute(setSelection({ kind: 'roomFeature', id: 'room-1' }));

    expect(controller.nudgeKeyDown('ArrowRight')).toBe(false);
  });
});
