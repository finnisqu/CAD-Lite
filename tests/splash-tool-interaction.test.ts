import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  ToolController,
  applicationStateFromLegacyPayload,
  createSplashEdgeTargets,
  linkedSplashForEdge,
  registerSplashToolHandler,
  setActiveLayout,
  setSelection,
  setWorkspace,
  splashToolOptions,
  type ToolPointerInput,
} from '../src/main';
import { v159ProjectFixture } from './fixtures/v159-project';

function pointer(x: number, y: number): ToolPointerInput {
  return {
    pointerId: 1,
    x,
    y,
    button: 0,
    buttons: 1,
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
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  const commands = new CommandDispatcher(store);
  commands.execute(setActiveLayout('layout-kitchen'));
  commands.execute(setWorkspace('design'));
  const tools = new ToolController(store, commands);
  let id = 0;
  const unregister = registerSplashToolHandler(
    (toolId, handler) => tools.register(toolId, handler),
    (prefix) => `${prefix}-test-${++id}`,
  );
  return { store, commands, tools, unregister };
}

function midpoint(target: ReturnType<typeof createSplashEdgeTargets>[number]) {
  return {
    x: (target.start.x + target.end.x) / 2,
    y: (target.start.y + target.end.y) / 2,
  };
}

describe('typed Splash tool interaction', () => {
  it('starts with production defaults and All Pieces scope', () => {
    const { tools, unregister } = setup();
    expect(tools.activateLocked('splash')).toBe(true);
    const active = tools.getActiveTool();
    expect(active?.scope).toBe('all');
    expect(active && splashToolOptions(active)).toEqual({
      brush: 'add',
      height: 4,
      offset: 0,
    });
    unregister();
  });

  it('limits edge targets to one selected parent when scope is Selected Piece', () => {
    const { store, commands, tools, unregister } = setup();
    commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));
    tools.activateLocked('splash');
    tools.setScope('selected');
    const active = tools.getActiveTool();
    expect(active).toBeTruthy();
    if (!active) return;

    const targets = createSplashEdgeTargets(store.getState(), active);
    expect(targets).toHaveLength(4);
    expect(new Set(targets.map((target) => target.pieceId))).toEqual(
      new Set(['piece-1']),
    );
    unregister();
  });

  it('adds and subtracts a linked Splash through the ToolController', () => {
    const { store, tools, unregister } = setup();
    tools.activateLocked('splash');
    let active = tools.getActiveTool();
    expect(active).toBeTruthy();
    if (!active) return;

    const top = createSplashEdgeTargets(store.getState(), active).find(
      (target) => target.pieceId === 'piece-1' && target.edge === 'top',
    );
    expect(top).toBeTruthy();
    if (!top) return;
    const point = midpoint(top);
    expect(tools.pointerDown(pointer(point.x, point.y))).toBe(true);

    let pieces = store.getState().project.layouts
      .find((layout) => layout.id === 'layout-kitchen')?.pieces ?? [];
    expect(linkedSplashForEdge(pieces, 'piece-1', 'top')).not.toBeNull();

    tools.setToolOption('brush', 'erase');
    active = tools.getActiveTool();
    expect(active && splashToolOptions(active).brush).toBe('erase');
    expect(tools.pointerDown(pointer(point.x, point.y))).toBe(true);

    pieces = store.getState().project.layouts
      .find((layout) => layout.id === 'layout-kitchen')?.pieces ?? [];
    expect(linkedSplashForEdge(pieces, 'piece-1', 'top')).toBeNull();
    unregister();
  });

  it('uses remembered Height and Offset for a new Splash', () => {
    const { store, tools, unregister } = setup();
    tools.activateLocked('splash');
    tools.setToolOption('height', 6.5);
    tools.setToolOption('offset', 0.5);
    const active = tools.getActiveTool();
    expect(active).toBeTruthy();
    if (!active) return;

    const right = createSplashEdgeTargets(store.getState(), active).find(
      (target) => target.pieceId === 'piece-1' && target.edge === 'right',
    );
    expect(right).toBeTruthy();
    if (!right) return;
    const point = midpoint(right);
    tools.pointerDown(pointer(point.x, point.y));

    const pieces = store.getState().project.layouts
      .find((layout) => layout.id === 'layout-kitchen')?.pieces ?? [];
    const splash = linkedSplashForEdge(pieces, 'piece-1', 'right');
    expect(splash?.h).toBe(6.5);
    expect(splash?.attachment?.offset).toBe(0.5);
    unregister();
  });

  it('exits locked Splash mode on a blank-canvas click', () => {
    const { tools, unregister } = setup();
    tools.activateLocked('splash');
    expect(tools.getActiveTool()?.id).toBe('splash');
    expect(tools.pointerDown(pointer(290, 190))).toBe(true);
    expect(tools.getActiveTool()).toBeNull();
    unregister();
  });
});
