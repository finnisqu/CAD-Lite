import { describe, expect, it, vi } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  ToolController,
  applicationStateFromLegacyPayload,
  getToolHudModel,
  renameLayout,
  setWorkspace,
} from '../src/app';
import type { ToolPointerInput } from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(applicationStateFromLegacyPayload(v159ProjectFixture));
  const commands = new CommandDispatcher(store);
  commands.execute(setWorkspace('design'));
  const tools = new ToolController(store, commands);
  return { store, commands, tools };
}

function pointer(x: number, y: number, buttons = 1): ToolPointerInput {
  return {
    pointerId: 7,
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

describe('tool controller lifecycle', () => {
  it('starts painter tools at All scope', () => {
    const { tools } = setup();

    tools.activateHeld('splash', 's');

    expect(tools.getActiveTool()).toMatchObject({
      id: 'splash',
      activation: 'momentary',
      heldKey: 's',
      scope: 'all',
    });
  });

  it('held tools steal a lock and do not fall back on key-up', () => {
    const { tools } = setup();

    tools.activateLocked('radius');
    tools.activateHeld('splash', 's');
    tools.releaseHeld('s');

    expect(tools.getActiveTool()).toBeNull();
  });

  it('promotes a held tool to a HUD lock without losing scope', () => {
    const { tools } = setup();

    tools.activateHeld('splash', 's');
    tools.setScope('selected');
    tools.promoteHeldToLocked();

    expect(tools.getActiveTool()).toMatchObject({
      id: 'splash',
      activation: 'locked',
      heldKey: null,
      scope: 'selected',
    });

    expect(tools.releaseHeld('s')).toBe(false);
  });

  it('toggles locked tool families off', () => {
    const { tools } = setup();

    tools.toggleLocked('edgePainter');
    expect(tools.getActiveTool()?.id).toBe('edgePainter');

    tools.toggleLocked('edgePainter');
    expect(tools.getActiveTool()).toBeNull();
  });

  it('uses S as slab move in SLAB and rejects DESIGN-only tools', () => {
    const { store, commands, tools } = setup();
    commands.execute(setWorkspace('slab'));

    expect(tools.handleKeyDown({ key: 's' })).toBe(true);
    expect(tools.getActiveTool()?.id).toBe('slabMove');
    expect(tools.activateHeld('splash', 's')).toBe(false);
    expect(store.getState().session.workspace).toBe('slab');
  });

  it('returns child Room Feature tools to their parent mode on cancel', () => {
    const { tools } = setup();

    tools.activateLocked('roomFeatures');
    tools.activateLocked('roomWall');
    expect(tools.isActive('roomFeatures')).toBe(true);

    tools.cancel();

    expect(tools.getActiveTool()).toMatchObject({
      id: 'roomFeatures',
      activation: 'locked',
    });
  });

  it('derives shared HUD state from the active tool session', () => {
    const { store, tools } = setup();

    tools.activateLocked('radius');
    tools.setScope('selected');

    const hud = getToolHudModel(store.getState().session.interaction);
    expect(hud).toEqual({
      visible: true,
      toolId: 'radius',
      title: 'RADIUS LABELS',
      locked: true,
      lockable: true,
      scope: 'selected',
      scopeEnabled: true,
      returnsToParent: false,
      parentToolId: null,
    });
  });
});

describe('tool input routing', () => {
  it('keeps pointer previews transient and clears them on pointer up', () => {
    const { store, tools } = setup();

    tools.register('line', {
      onPointerMove: (_context, input) => ({
        preview: { x: input.x, y: input.y },
      }),
    });

    tools.activateLocked('line');
    tools.pointerDown(pointer(10, 20));
    tools.pointerMove(pointer(15, 25));

    expect(store.getState().session.interaction.preview).toEqual({ x: 15, y: 25 });
    expect(store.getState().session.interaction.pointer).toMatchObject({
      startX: 10,
      startY: 20,
      x: 15,
      y: 25,
    });

    tools.pointerUp(pointer(20, 30, 0));

    expect(store.getState().session.interaction.preview).toBeNull();
    expect(store.getState().session.interaction.pointer).toBeNull();
  });

  it('commits handler commands and interaction cleanup as one transaction', () => {
    const { store, tools } = setup();
    const listener = vi.fn();
    store.subscribe(listener);

    tools.register('note', {
      onPointerUp: () => ({
        transactionLabel: 'Place note',
        commands: [renameLayout('layout-kitchen', 'Kitchen Note Test')],
      }),
    });

    tools.activateLocked('note');
    listener.mockClear();

    tools.pointerDown(pointer(10, 10));
    listener.mockClear();
    tools.pointerUp(pointer(10, 10, 0));

    expect(store.getState().project.layouts[0]?.name).toBe('Kitchen Note Test');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      kind: 'transaction',
      label: 'Place note',
      history: 'record',
      persistence: 'save',
    });
  });

  it('routes keyboard shortcuts for hold, lock, release, Escape, and Q', () => {
    const { tools } = setup();

    expect(tools.handleKeyDown({ key: 'd' })).toBe(true);
    expect(tools.getActiveTool()?.id).toBe('dimension');
    expect(tools.handleKeyUp({ key: 'd' })).toBe(true);
    expect(tools.getActiveTool()).toBeNull();

    expect(tools.handleKeyDown({ key: 'e', shiftKey: true })).toBe(true);
    expect(tools.getActiveTool()).toMatchObject({
      id: 'edgePainter',
      activation: 'locked',
    });

    expect(tools.handleKeyDown({ key: 'Escape' })).toBe(true);
    expect(tools.getActiveTool()).toBeNull();

    expect(tools.handleKeyDown({ key: 'q' })).toBe(true);
    expect(tools.isActive('roomFeatures')).toBe(true);
  });
});
