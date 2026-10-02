import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  ToolController,
  applicationStateFromLegacyPayload,
  createEdgePainterTargets,
  normalizeEdgePainterProfile,
  registerEdgePainterToolHandler,
  setActiveLayout,
  setSelection,
  setWorkspace,
  transformPieces,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  const commands = new CommandDispatcher(store);
  commands.execute(setActiveLayout('layout-kitchen'));
  commands.execute(setWorkspace('design'));
  const tools = new ToolController(store, commands);
  registerEdgePainterToolHandler(
    (toolId, handler) => tools.register(toolId, handler),
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

function targetMidpoint(
  target: ReturnType<typeof createEdgePainterTargets>[number],
) {
  return {
    x: (target.start.x + target.end.x) / 2,
    y: (target.start.y + target.end.y) / 2,
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

describe('Edge Painter tool', () => {
  it('paints and erases one physical Piece edge through the common tool controller', () => {
    const { store, tools } = setup();
    tools.activateLocked('edgePainter');
    tools.setToolOption('profile', 'ogee');
    const active = tools.getActiveTool();
    if (!active) throw new Error('Edge Painter tool is not active');
    const target = createEdgePainterTargets(store.getState(), active).find(
      (item) => item.pieceId === 'piece-1' && item.side === 'top',
    );
    if (!target) throw new Error('Missing top Edge Painter target');
    const point = targetMidpoint(target);

    expect(pointerDown(tools, point.x, point.y)).toBe(true);
    expect(
      activeLayout(store).pieces.find((piece) => piece.id === 'piece-1')?.edgeProfiles.top,
    ).toBe('ogee');

    tools.setToolOption('brush', 'erase');
    expect(pointerDown(tools, point.x, point.y)).toBe(true);
    expect(
      activeLayout(store).pieces.find((piece) => piece.id === 'piece-1')?.edgeProfiles.top,
    ).toBe('flat');
  });

  it('requires exactly one selected Piece in Selected Piece scope', () => {
    const { store, commands, tools } = setup();
    tools.activateLocked('edgePainter');
    tools.setScope('selected');

    expect(
      createEdgePainterTargets(store.getState(), tools.getActiveTool()!),
    ).toEqual([]);

    commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));
    const targets = createEdgePainterTargets(
      store.getState(),
      tools.getActiveTool()!,
    );
    expect(targets).toHaveLength(4);
    expect(new Set(targets.map((target) => target.pieceId))).toEqual(
      new Set(['piece-1']),
    );
  });

  it('projects rotated physical edges rather than axis-aligned hit regions', () => {
    const { store, commands, tools } = setup();
    const piece = activeLayout(store).pieces.find((item) => item.id === 'piece-1');
    if (!piece) throw new Error('Missing Piece fixture');
    commands.execute(
      transformPieces('layout-kitchen', [
        {
          id: piece.id,
          designPose: { x: piece.x, y: piece.y, rotation: 30 },
        },
      ]),
    );
    tools.activateLocked('edgePainter');
    const top = createEdgePainterTargets(
      store.getState(),
      tools.getActiveTool()!,
    ).find((target) => target.side === 'top');
    if (!top) throw new Error('Missing rotated top edge');

    expect(Math.abs(top.end.x - top.start.x)).toBeGreaterThan(0);
    expect(Math.abs(top.end.y - top.start.y)).toBeGreaterThan(0);
  });

  it('keeps the tool active inside an eligible Piece but exits on blank canvas', () => {
    const { store, tools } = setup();
    tools.activateLocked('edgePainter');
    const piece = activeLayout(store).pieces.find((item) => item.id === 'piece-1');
    if (!piece) throw new Error('Missing Piece fixture');

    expect(pointerDown(tools, piece.x + piece.w / 2, piece.y + piece.h / 2)).toBe(true);
    expect(tools.getActiveTool()?.id).toBe('edgePainter');

    expect(pointerDown(tools, 9999, 9999)).toBe(true);
    expect(tools.getActiveTool()).toBeNull();
  });

  it('normalizes remembered production profile values safely', () => {
    expect(normalizeEdgePainterProfile('quarter')).toBe('quarter');
    expect(normalizeEdgePainterProfile('miter')).toBe('miter');
    expect(normalizeEdgePainterProfile('not-a-profile')).toBe('quarter');
  });
});
