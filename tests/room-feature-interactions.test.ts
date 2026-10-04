import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  RoomFeatureInteractionController,
  ToolController,
  applicationStateFromLegacyPayload,
  registerRoomFeatureToolHandlers,
  setWorkspace,
} from '../src/app';
import type { ToolPointerInput } from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function pointer(
  x: number,
  y: number,
  options: Partial<ToolPointerInput> = {},
): ToolPointerInput {
  return {
    pointerId: 9,
    x,
    y,
    button: 0,
    buttons: 1,
    modifiers: {
      shift: false,
      alt: true,
      ctrl: false,
      meta: false,
      ...(options.modifiers ?? {}),
    },
    ...options,
  };
}

function setup() {
  const payload = structuredClone(v159ProjectFixture);
  if (!payload.ui || typeof payload.ui !== 'object' || Array.isArray(payload.ui)) {
    throw new Error('Fixture UI shape changed');
  }
  payload.ui.workspace = 'layout';
  payload.active = 0;

  const store = new AppStore(applicationStateFromLegacyPayload(payload));
  const commands = new CommandDispatcher(store);
  const tools = new ToolController(store, commands);
  let counter = 0;
  registerRoomFeatureToolHandlers(
    (toolId, handler) => tools.register(toolId, handler),
    (prefix) => `${prefix}-test-${++counter}`,
  );
  const interaction = new RoomFeatureInteractionController(store, commands);
  return { store, commands, tools, interaction };
}

describe('Batch 24 Room Feature tools', () => {
  it('uses Q as the locked Room Features parent and places a base feature', () => {
    const { store, tools } = setup();
    const before = store.getState().project.layouts[0]!.roomFeatures.length;

    expect(tools.handleKeyDown({ key: 'q' })).toBe(true);
    expect(tools.getActiveTool()).toMatchObject({
      id: 'roomFeatures',
      activation: 'locked',
    });

    tools.pointerDown(pointer(20, 30));
    tools.pointerUp(pointer(20, 30, { buttons: 0 }));

    const layout = store.getState().project.layouts[0]!;
    expect(layout.roomFeatures).toHaveLength(before + 1);
    expect(layout.roomFeatures.at(-1)).toMatchObject({
      featureType: 'base',
      x: 20,
      y: 30,
      length: 36,
      depth: 24,
      receivesCountertop: true,
    });
    expect(tools.getActiveTool()?.id).toBe('roomFeatures');
  });

  it('uses W as a momentary linked-wall child and returns to Q mode on key-up', () => {
    const { store, tools } = setup();
    tools.handleKeyDown({ key: 'q' });

    expect(tools.handleKeyDown({ key: 'w' })).toBe(true);
    expect(tools.getActiveTool()).toMatchObject({
      id: 'linkedWall',
      activation: 'momentary',
      heldKey: 'w',
    });

    tools.pointerDown(pointer(10, 20));
    tools.pointerMove(pointer(50, 20));
    tools.pointerUp(pointer(50, 20, { buttons: 0 }));

    const wall = store.getState().project.layouts[0]!.roomFeatures.at(-1)!;
    expect(wall).toMatchObject({
      kind: 'wall',
      featureType: 'linked-wall',
      wallType: 'linked',
      length: 40,
      depth: 4,
      rotation: 0,
    });

    expect(tools.handleKeyUp({ key: 'w' })).toBe(true);
    expect(tools.getActiveTool()).toMatchObject({
      id: 'roomFeatures',
      activation: 'locked',
    });
  });

  it('supports the full-wall child tool and Shift-constrained placement', () => {
    const { store, tools } = setup();
    tools.activateLocked('roomFeatures');
    expect(tools.activateLocked('roomWall')).toBe(true);

    tools.pointerDown(pointer(30, 30));
    const end = pointer(70, 43, {
      modifiers: {
        shift: true,
        alt: true,
        ctrl: false,
        meta: false,
      },
    });
    tools.pointerMove(end);
    tools.pointerUp({ ...end, buttons: 0 });

    expect(store.getState().project.layouts[0]!.roomFeatures.at(-1)).toMatchObject({
      kind: 'wall',
      wallType: 'full',
      length: 40,
      rotation: 0,
    });
  });

  it('keeps Room Feature tools unavailable in SLAB', () => {
    const { commands, tools } = setup();
    commands.execute(setWorkspace('slab'));

    expect(tools.handleKeyDown({ key: 'q' })).toBe(false);
    expect(tools.activateLocked('roomWall')).toBe(false);
    expect(tools.activateHeld('linkedWall', 'w')).toBe(false);
  });
});

describe('Batch 24 direct Room Feature editing', () => {
  it('previews a move without mutating the Layout, then commits once', () => {
    const { store, interaction } = setup();
    const before = structuredClone(
      store.getState().project.layouts[0]!.roomFeatures[0],
    );

    expect(interaction.beginMove('room-1', pointer(41, 101))).toBe(true);
    interaction.pointerMove(pointer(61, 111));

    expect(store.getState().project.layouts[0]!.roomFeatures[0]).toEqual(before);
    expect(interaction.getPreview()).toMatchObject({
      kind: 'room-feature-edit',
      id: 'room-1',
      patch: { x: 60, y: 110 },
    });

    interaction.pointerUp(pointer(61, 111, { buttons: 0 }));
    expect(store.getState().project.layouts[0]!.roomFeatures[0]).toMatchObject({
      x: 60,
      y: 110,
    });
  });

  it('resizes from a side while keeping the opposite side fixed', () => {
    const { store, interaction } = setup();
    const feature = store.getState().project.layouts[0]!.roomFeatures[0]!;

    expect(
      interaction.beginResize(
        feature.id,
        'right',
        pointer(feature.x + feature.length, feature.y + feature.depth / 2),
      ),
    ).toBe(true);
    interaction.pointerMove(
      pointer(feature.x + feature.length + 12, feature.y + feature.depth / 2),
    );
    interaction.pointerUp(
      pointer(feature.x + feature.length + 12, feature.y + feature.depth / 2, {
        buttons: 0,
      }),
    );

    expect(store.getState().project.layouts[0]!.roomFeatures[0]).toMatchObject({
      x: feature.x,
      length: feature.length + 12,
    });
  });

  it('rotates with Shift snapping to a cardinal angle', () => {
    const { store, interaction } = setup();
    const feature = store.getState().project.layouts[0]!.roomFeatures[0]!;
    const center = {
      x: feature.x + feature.length / 2,
      y: feature.y + feature.depth / 2,
    };

    interaction.beginRotate(feature.id, pointer(center.x + 20, center.y));
    const end = pointer(center.x + 2, center.y + 30, {
      modifiers: {
        shift: true,
        alt: true,
        ctrl: false,
        meta: false,
      },
    });
    interaction.pointerMove(end);
    interaction.pointerUp({ ...end, buttons: 0 });

    expect(store.getState().project.layouts[0]!.roomFeatures[0]?.rotation).toBe(90);
  });

  it('soft-snaps rotation to a cardinal angle within five degrees', () => {
    const { store, interaction } = setup();
    const feature = store.getState().project.layouts[0]!.roomFeatures[0]!;
    const center = {
      x: feature.x + feature.length / 2,
      y: feature.y + feature.depth / 2,
    };

    interaction.beginRotate(feature.id, pointer(center.x + 20, center.y));
    const radians = 86 * Math.PI / 180;
    const end = pointer(
      center.x + Math.cos(radians) * 30,
      center.y + Math.sin(radians) * 30,
      {
        modifiers: {
          shift: false,
          alt: false,
          ctrl: false,
          meta: false,
        },
      },
    );
    interaction.pointerMove(end);
    interaction.pointerUp({ ...end, buttons: 0 });

    expect(store.getState().project.layouts[0]!.roomFeatures[0]?.rotation).toBe(90);
  });

  it('cancels an edit without mutating persisted geometry', () => {
    const { store, interaction } = setup();
    const before = structuredClone(
      store.getState().project.layouts[0]!.roomFeatures[0],
    );

    interaction.beginMove('room-1', pointer(41, 101));
    interaction.pointerMove(pointer(80, 140));
    expect(interaction.getPreview()).not.toBeNull();
    expect(interaction.cancel()).toBe(true);

    expect(store.getState().project.layouts[0]!.roomFeatures[0]).toEqual(before);
    expect(store.getState().session.interaction.preview).toBeNull();
  });
});
