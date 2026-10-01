import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  ToolController,
  applicationStateFromLegacyPayload,
  createRadiusCornerTargets,
  registerRadiusToolHandler,
  setActiveLayout,
  setSelection,
  setWorkspace,
  transformPieces,
} from '../src/app';
import { resolveRadiusTarget } from '../src/domain/annotations/radius';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  const commands = new CommandDispatcher(store);
  commands.execute(setActiveLayout('layout-kitchen'));
  commands.execute(setWorkspace('design'));
  const piece = store.getState().project.layouts
    .find((layout) => layout.id === 'layout-kitchen')
    ?.pieces.find((item) => item.id === 'piece-1');
  if (!piece) throw new Error('Missing Piece fixture');
  commands.execute(
    transformPieces('layout-kitchen', [
      {
        id: piece.id,
        geometry: {
          kind: 'rectangle',
          width: piece.w,
          height: piece.h,
          cornerRadii: { ...piece.cornerRadii, tl: 2 },
        },
      },
    ]),
  );
  const tools = new ToolController(store, commands);
  let id = 0;
  registerRadiusToolHandler(
    (toolId, handler) => tools.register(toolId, handler),
    (prefix) => `${prefix}-${++id}`,
  );
  return { store, commands, tools };
}

function activeLayout(store: AppStore) {
  const layout = store.getState().project.layouts.find(
    (item) => item.id === 'layout-kitchen',
  );
  if (!layout) throw new Error('Missing Layout fixture');
  return layout;
}

function pieceTlTarget(store: AppStore, tools: ToolController) {
  const tool = tools.getActiveTool();
  if (!tool) throw new Error('Radius tool is not active');
  const target = createRadiusCornerTargets(store.getState(), tool).find(
    (item) =>
      item.reference.kind === 'piece' &&
      item.reference.pieceId === 'piece-1' &&
      item.reference.corner === 'tl',
  );
  if (!target) throw new Error('Missing top-left Radius target');
  return target;
}

function arcMidpoint(target: ReturnType<typeof pieceTlTarget>) {
  const { start, control, end } = target.arc;
  return {
    x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
  };
}

function pointerDown(tools: ToolController, x: number, y: number) {
  return tools.pointerDown({
    pointerId: 1,
    x,
    y,
    button: 0,
    buttons: 1,
    modifiers: { shift: false, alt: false, ctrl: false, meta: false },
  });
}

describe('Radius Label tool', () => {
  it('adds and erases a Radius annotation through the common tool controller', () => {
    const { store, tools } = setup();
    tools.activateLocked('radius');
    const point = arcMidpoint(pieceTlTarget(store, tools));

    expect(pointerDown(tools, point.x, point.y)).toBe(true);
    expect(
      activeLayout(store).notes.filter((note) => note.annotationType === 'radius'),
    ).toHaveLength(1);

    tools.setToolOption('brush', 'erase');
    expect(pointerDown(tools, point.x, point.y)).toBe(true);
    expect(
      activeLayout(store).notes.filter((note) => note.annotationType === 'radius'),
    ).toHaveLength(0);
  });

  it('limits targets to one selected Piece in Selected Piece scope', () => {
    const { store, commands, tools } = setup();
    tools.activateLocked('radius');
    tools.setScope('selected');

    expect(createRadiusCornerTargets(store.getState(), tools.getActiveTool()!)).toEqual([]);

    commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));
    const targets = createRadiusCornerTargets(store.getState(), tools.getActiveTool()!);
    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets.map((target) => target.reference.pieceId))).toEqual(
      new Set(['piece-1']),
    );
  });

  it('cancels on blank canvas but stays active when clicking inside an eligible Piece', () => {
    const { store, tools } = setup();
    tools.activateLocked('radius');
    const piece = activeLayout(store).pieces.find((item) => item.id === 'piece-1');
    if (!piece) throw new Error('Missing Piece fixture');

    expect(pointerDown(tools, piece.x + piece.w / 2, piece.y + piece.h / 2)).toBe(true);
    expect(tools.getActiveTool()?.id).toBe('radius');

    expect(pointerDown(tools, 9999, 9999)).toBe(true);
    expect(tools.getActiveTool()).toBeNull();
  });

  it('remembers Inside placement and places a new Note inward from the radius target', () => {
    const { store, tools } = setup();
    tools.activateLocked('radius');
    tools.setToolOption('placement', 'inside');
    const target = pieceTlTarget(store, tools);
    const point = arcMidpoint(target);
    pointerDown(tools, point.x, point.y);

    const note = activeLayout(store).notes.find(
      (item) => item.annotationType === 'radius',
    );
    const reference = note?.radiusRef;
    if (!note || !reference || typeof reference !== 'object') {
      throw new Error('Missing Radius Note');
    }
    const resolved = resolveRadiusTarget(
      activeLayout(store),
      reference as Parameters<typeof resolveRadiusTarget>[1],
    );
    if (!resolved) throw new Error('Missing Radius target');
    const dot =
      (note.x - resolved.x) * resolved.outward.x +
      (note.y - resolved.y) * resolved.outward.y;
    expect(dot).toBeLessThan(0);

    tools.cancel();
    tools.activateLocked('radius');
    expect(tools.getActiveTool()?.options.placement).toBe('inside');
  });
});
