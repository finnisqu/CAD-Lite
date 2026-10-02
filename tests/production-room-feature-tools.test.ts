import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  ToolController,
  applicationStateFromLegacyPayload,
  registerProductionRoomFeatureToolHandlers,
  setWorkspace,
  type ToolPointerInput,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function pointer(
  x: number,
  y: number,
  buttons = 1,
): ToolPointerInput {
  return {
    pointerId: 41,
    x,
    y,
    button: 0,
    buttons,
    modifiers: {
      shift: false,
      alt: false,
      ctrl: false,
      meta: false,
    },
  };
}

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(structuredClone(v159ProjectFixture)),
  );
  const commands = new CommandDispatcher(store);
  commands.execute(setWorkspace('design'));
  const tools = new ToolController(store, commands);
  let id = 0;
  registerProductionRoomFeatureToolHandlers(
    (toolId, handler) => tools.register(toolId, handler),
    (prefix) => `${prefix}-production-${++id}`,
  );
  return { store, tools };
}

describe('Batch 59 production Room Feature tool parity', () => {
  it('applies Wall Type and Thickness HUD options to created Room Walls', () => {
    const { store, tools } = setup();
    const before = store.getState().project.layouts[0]?.roomFeatures.length ?? 0;

    expect(tools.activateLocked('roomWall')).toBe(true);
    expect(tools.setToolOption('wallType', 'knee')).toBe(true);
    expect(tools.setToolOption('thickness', 8.5)).toBe(true);

    tools.pointerDown(pointer(20, 30));
    tools.pointerMove(pointer(80, 30));
    tools.pointerUp(pointer(80, 30, 0));

    const roomFeatures = store.getState().project.layouts[0]?.roomFeatures ?? [];
    expect(roomFeatures).toHaveLength(before + 1);
    expect(roomFeatures.at(-1)).toMatchObject({
      kind: 'wall',
      featureType: 'wall',
      name: 'Knee Wall',
      wallType: 'knee',
      depth: 8.5,
      length: 60,
      rotation: 0,
    });
  });

  it('keeps Linked Walls linked while honoring the shared Thickness option', () => {
    const { store, tools } = setup();
    const before = store.getState().project.layouts[0]?.roomFeatures.length ?? 0;

    expect(tools.activateLocked('linkedWall')).toBe(true);
    expect(tools.setToolOption('thickness', 6.25)).toBe(true);

    tools.pointerDown(pointer(10, 10));
    tools.pointerMove(pointer(10, 70));
    tools.pointerUp(pointer(10, 70, 0));

    const roomFeatures = store.getState().project.layouts[0]?.roomFeatures ?? [];
    expect(roomFeatures).toHaveLength(before + 1);
    expect(roomFeatures.at(-1)).toMatchObject({
      kind: 'wall',
      featureType: 'linked-wall',
      name: 'Linked Wall',
      wallType: 'linked',
      depth: 6.25,
      length: 60,
      rotation: 90,
    });
  });
});
