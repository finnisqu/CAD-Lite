import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  ToolController,
  applicationStateFromLegacyPayload,
  registerAnnotationToolHandlers,
} from '../src/app';
import type { ToolPointerInput } from '../src/app/interaction';
import { v159ProjectFixture } from './fixtures/v159-project';

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
  const unregister = registerAnnotationToolHandlers(
    (toolId, handler) => tools.register(toolId, handler),
    (prefix) => `${prefix}-test-${++counter}`,
  );

  return { store, commands, tools, unregister };
}

function pointer(
  x: number,
  y: number,
  options: Partial<ToolPointerInput> = {},
): ToolPointerInput {
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
      ...(options.modifiers ?? {}),
    },
    ...options,
  };
}

describe('Batch 21 annotation tool interactions', () => {
  it('creates a Dimension through the tool controller and Shift-constrains it horizontally', () => {
    const { store, tools, unregister } = setup();
    expect(tools.activateLocked('dimension')).toBe(true);

    expect(tools.pointerDown(pointer(10.2, 15.2))).toBe(true);
    expect(
      tools.pointerMove(
        pointer(35.8, 20.4, {
          modifiers: {
            shift: true,
            alt: true,
            ctrl: false,
            meta: false,
          },
        }),
      ),
    ).toBe(true);
    expect(
      tools.pointerUp(
        pointer(35.8, 20.4, {
          buttons: 0,
          modifiers: {
            shift: true,
            alt: true,
            ctrl: false,
            meta: false,
          },
        }),
      ),
    ).toBe(true);

    const layout = store.getState().project.layouts[0]!;
    const created = layout.dims.find((item) => item.id === 'dimension-test-1');
    expect(created).toMatchObject({
      x1: 10,
      y1: 15,
      x2: 35.8,
      y2: 15,
    });
    expect(store.getState().session.selection).toEqual({
      kind: 'dimension',
      id: 'dimension-test-1',
    });

    unregister.forEach((fn) => fn());
  });

  it('rejects a zero-length Line and keeps the graph unchanged', () => {
    const { store, tools, unregister } = setup();
    const before = store.getState().project.layouts[0]!.lines.length;
    expect(tools.activateLocked('line')).toBe(true);

    tools.pointerDown(pointer(14, 14));
    tools.pointerUp(pointer(14, 14, { buttons: 0 }));

    expect(store.getState().project.layouts[0]!.lines).toHaveLength(before);
    unregister.forEach((fn) => fn());
  });

  it('creates a Note at a snapped point with one typed command', () => {
    const { store, tools, unregister } = setup();
    expect(tools.activateLocked('note')).toBe(true);

    tools.pointerDown(
      pointer(22.2, 31.7, {
        modifiers: {
          shift: false,
          alt: true,
          ctrl: false,
          meta: false,
        },
      }),
    );

    const note = store
      .getState()
      .project.layouts[0]!
      .notes.find((item) => item.id === 'note-test-1');

    expect(note).toMatchObject({
      x: 22.2,
      y: 31.7,
      text: 'Note',
    });
    expect(store.getState().session.selection).toEqual({
      kind: 'note',
      id: 'note-test-1',
    });

    unregister.forEach((fn) => fn());
  });

  it('keeps annotation creation inert in SLAB', () => {
    const { store, commands, tools, unregister } = setup();
    commands.execute({
      type: 'test.workspace.slab',
      label: 'SLAB',
      history: 'ignore',
      persistence: 'ignore',
      reduce(state) {
        return {
          ...state,
          session: { ...state.session, workspace: 'slab' as const },
        };
      },
    });

    expect(tools.activateLocked('dimension')).toBe(false);
    const before = store.getState().project.layouts[0]!.dims.length;
    tools.pointerDown(pointer(5, 5));
    tools.pointerUp(pointer(20, 5, { buttons: 0 }));
    expect(store.getState().project.layouts[0]!.dims).toHaveLength(before);

    unregister.forEach((fn) => fn());
  });
});
