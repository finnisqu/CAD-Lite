import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  ToolController,
  applicationStateFromLegacyPayload,
  createLinkedWallTargets,
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
  const payload = structuredClone(v159ProjectFixture);
  payload.active = 0;
  const store = new AppStore(
    applicationStateFromLegacyPayload(payload),
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

describe('production Room Feature tool parity', () => {
  it('keeps the Room Features parent as a layer switch instead of a cabinet stamp', () => {
    const { store, tools } = setup();
    const before = store.getState().project.layouts[0]?.roomFeatures.length ?? 0;

    expect(tools.activateLocked('roomFeatures')).toBe(true);
    tools.pointerDown(pointer(44, 32));
    tools.pointerMove(pointer(60, 44));
    tools.pointerUp(pointer(60, 44, 0));

    expect(store.getState().project.layouts[0]?.roomFeatures).toHaveLength(before);
    expect(store.getState().session.interaction.preview).toBeNull();
    expect(tools.getActiveTool()).toMatchObject({
      id: 'roomFeatures',
      activation: 'locked',
    });
  });

  it('uses the v1.5.99 two-click wall flow and chains a locked wall from the endpoint', () => {
    const { store, tools } = setup();
    const before = store.getState().project.layouts[0]?.roomFeatures.length ?? 0;

    expect(tools.activateLocked('roomWall')).toBe(true);
    expect(tools.setToolOption('wallType', 'knee')).toBe(true);
    expect(tools.setToolOption('thickness', 8.5)).toBe(true);

    // First click seeds the reference face. Releasing the pointer must not
    // create a wall or clear the start point.
    tools.pointerDown(pointer(20, 30));
    tools.pointerUp(pointer(20, 30, 0));
    expect(store.getState().project.layouts[0]?.roomFeatures).toHaveLength(before);
    expect(store.getState().session.interaction.preview).toMatchObject({
      tool: 'roomWall',
      startX: 20,
      startY: 30,
    });

    tools.pointerMove(pointer(80, 30, 0));
    expect(store.getState().session.interaction.preview).toMatchObject({
      length: 60,
      rotation: 0,
    });

    // The second click commits. No drag/release is required.
    tools.pointerDown(pointer(80, 30));

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
    expect(store.getState().session.interaction.preview).toMatchObject({
      tool: 'roomWall',
      startX: 80,
      startY: 30,
      rawLength: 0,
    });
  });

  it('ignores an effectively zero-length second wall click instead of creating a default wall', () => {
    const { store, tools } = setup();
    const before = store.getState().project.layouts[0]?.roomFeatures.length ?? 0;

    expect(tools.activateLocked('roomWall')).toBe(true);
    tools.pointerDown(pointer(20, 30));
    tools.pointerUp(pointer(20, 30, 0));
    tools.pointerDown(pointer(20.05, 30.05));

    expect(store.getState().project.layouts[0]?.roomFeatures).toHaveLength(before);
    expect(store.getState().session.interaction.preview).toMatchObject({
      startX: 20,
      startY: 30,
    });
  });

  it('uses Linked Walls as an add/erase edge brush with shared Thickness', () => {
    const { store, tools } = setup();
    const before = store.getState().project.layouts[0]?.roomFeatures.length ?? 0;

    expect(tools.activateLocked('linkedWall')).toBe(true);
    expect(tools.setToolOption('thickness', 6.25)).toBe(true);

    const back = createLinkedWallTargets(store.getState(), 6.25).find(
      (target) => target.anchorFeatureId === 'room-1' && target.edge === 'back',
    );
    if (!back) throw new Error('Expected linked-wall back-edge target');
    const midpoint = {
      x: (back.p1.x + back.p2.x) / 2,
      y: (back.p1.y + back.p2.y) / 2,
    };

    tools.pointerDown(pointer(midpoint.x, midpoint.y));

    let roomFeatures = store.getState().project.layouts[0]?.roomFeatures ?? [];
    expect(roomFeatures).toHaveLength(before + 1);
    expect(roomFeatures.at(-1)).toMatchObject({
      kind: 'wall',
      featureType: 'wall',
      name: 'Back Wall',
      wallType: 'full',
      depth: 6.25,
      length: 36,
      rotation: 0,
      attachment: {
        kind: 'roomFeatureWall',
        anchorFeatureId: 'room-1',
        edge: 'back',
        linked: true,
      },
    });

    expect(tools.setToolOption('brush', 'erase')).toBe(true);
    tools.pointerDown(pointer(midpoint.x, midpoint.y));

    roomFeatures = store.getState().project.layouts[0]?.roomFeatures ?? [];
    expect(roomFeatures).toHaveLength(before);
  });
});
