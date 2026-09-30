import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  HistoryManager,
  PieceInteractionController,
  applicationStateFromLegacyPayload,
  transformPieces,
} from '../src/app';
import {
  hitTestPieceCanvas,
  createPieceCanvasProjection,
} from '../src/browser';
import {
  normalizeDegrees,
} from '../src/core/numeric';
import {
  normalizePieces,
} from '../src/persistence/pieces';
import type { Layout } from '../src/domain/project';
import {
  createPieceMoveSession,
  createPieceResizeSession,
  previewPieceMove,
  previewPieceResize,
  resolvePiecePointerSelection,
} from '../src/app/interaction/pieces';
import type { ToolPointerInput } from '../src/app';

function pointer(
  x: number,
  y: number,
  options: Partial<ToolPointerInput> = {},
): ToolPointerInput {
  return {
    pointerId: options.pointerId ?? 1,
    x,
    y,
    button: options.button ?? 0,
    buttons: options.buttons ?? 1,
    modifiers: {
      shift: options.modifiers?.shift ?? false,
      alt: options.modifiers?.alt ?? false,
      ctrl: options.modifiers?.ctrl ?? false,
      meta: options.modifiers?.meta ?? false,
    },
  };
}

function fixture(workspace: 'design' | 'slab' = 'design') {
  return {
    sinkSideConvention: 'front-bottom-v1',
    project: { name: 'Interactions', date: '2026-09-30', notes: '' },
    materials: [],
    layouts: [
      {
        id: 'layout',
        name: 'Layout',
        quantity: 1,
        cw: 160,
        ch: 100,
        scale: 8,
        grid: 1,
        showGrid: true,
        pieceFillOpacity: 1,
        slabCW: 160,
        slabCH: 100,
        areas: [{ id: 'a', name: 'A' }],
        activeAreaId: 'a',
        pieces: [
          {
            id: 'a',
            name: 'A',
            areaId: 'a',
            x: 10,
            y: 10,
            w: 20,
            h: 10,
            rotation: 0,
            layer: 1,
            color: '#ffffff',
            pieceGroupId: 'group',
            pieceGroupName: 'Group',
            slabPlacement: { x: 10, y: 60, rotation: 0 },
          },
          {
            id: 'b',
            name: 'B',
            areaId: 'a',
            x: 40,
            y: 10,
            w: 20,
            h: 10,
            rotation: 0,
            layer: 2,
            color: '#ffffff',
            pieceGroupId: 'group',
            pieceGroupName: 'Group',
            slabPlacement: { x: 45, y: 60, rotation: 0 },
          },
          {
            id: 'target',
            name: 'Target',
            areaId: 'a',
            x: 80,
            y: 10,
            w: 20,
            h: 10,
            rotation: 0,
            layer: 3,
            color: '#ffffff',
            slabPlacement: { x: 80, y: 60, rotation: 0 },
          },
          {
            id: 'splash',
            name: 'Splash',
            areaId: 'a',
            x: 10,
            y: 3,
            w: 20,
            h: 4,
            rotation: 0,
            layer: 4,
            pieceType: 'backsplash',
            attachment: {
              kind: 'backsplash',
              parentPieceId: 'a',
              snapped: true,
            },
            slabPlacement: { x: 5, y: 85, rotation: 0 },
          },
          {
            id: 'loose-splash',
            name: 'Loose Splash',
            areaId: 'a',
            x: 40,
            y: 3,
            w: 20,
            h: 4,
            rotation: 0,
            layer: 5,
            pieceType: 'backsplash',
            attachment: {
              kind: 'backsplash',
              parentPieceId: 'b',
              snapped: false,
            },
            slabPlacement: { x: 40, y: 85, rotation: 0 },
          },
        ],
        dims: [],
        notes: [],
        lines: [],
        roomFeatures: [],
        plan: null,
        overlays: [],
      },
    ],
    ui: {
      workspace: workspace === 'slab' ? 'slab' : 'layout',
      pieceSnap: true,
      gridSnap: true,
      slabCutClearance: 0.25,
      showGrid: true,
      showDims: true,
      dimPrecision: 16,
      dimFormat: 'fraction',
    },
    active: 0,
  };
}

function setup(workspace: 'design' | 'slab' = 'design') {
  const state = applicationStateFromLegacyPayload(fixture(workspace));
  const store = new AppStore(state);
  const commands = new CommandDispatcher(store);
  return {
    store,
    commands,
    controller: new PieceInteractionController(store, commands),
  };
}

function layoutFromFixture(): Layout {
  const state = applicationStateFromLegacyPayload(fixture());
  const layout = state.project.layouts[0];
  if (!layout) throw new Error('Missing Layout');
  return layout;
}

describe('Piece pointer selection compatibility', () => {
  it('selects an ordinary group first and drills into a member on a second click', () => {
    const layout = layoutFromFixture();
    const first = resolvePiecePointerSelection(
      layout,
      { kind: 'none' },
      'a',
      'design',
    );
    expect(first).toEqual({
      selection: { kind: 'pieces', ids: ['a', 'b'] },
      drillInId: null,
    });

    const second = resolvePiecePointerSelection(
      layout,
      first.selection,
      'a',
      'design',
    );
    expect(second).toEqual({
      selection: { kind: 'pieces', ids: ['a', 'b'] },
      drillInId: 'a',
    });
  });

  it('uses ctrl/meta as an additive toggle outside fabrication assembly selection', () => {
    const layout = layoutFromFixture();
    expect(
      resolvePiecePointerSelection(
        layout,
        { kind: 'pieces', ids: ['target'] },
        'a',
        'design',
        true,
      ).selection,
    ).toEqual({ kind: 'pieces', ids: ['target', 'a'] });
  });
});

describe('Piece canvas hit testing', () => {
  it('hits the highest rendered Piece and respects rounded corners', () => {
    const { store } = setup();
    const layout = store.getState().project.layouts[0];
    if (!layout) throw new Error('Missing Layout');
    const top = layout.pieces.find((piece) => piece.id === 'target');
    if (!top) throw new Error('Missing target');
    top.x = 10;
    top.y = 10;
    top.w = 20;
    top.h = 10;
    top.layer = 99;
    top.cornerRadii = { tl: 4, tr: 0, br: 0, bl: 0 };

    const projection = createPieceCanvasProjection(store.getState());
    expect(hitTestPieceCanvas(projection, { x: 15, y: 15 })?.id).toBe(
      'target',
    );
    expect(hitTestPieceCanvas(projection, { x: 10.2, y: 10.2 })?.id).not.toBe(
      'target',
    );
  });
});

describe('Piece move projection', () => {
  it('moves selected DESIGN pieces rigidly and carries only snapped splash children', () => {
    const { store, commands } = setup();
    commands.execute({
      type: 'test.select',
      label: 'select',
      history: 'skip',
      persistence: 'skip',
      reduce(state) {
        return {
          ...state,
          session: {
            ...state.session,
            selection: { kind: 'pieces', ids: ['a', 'b'] },
          },
        };
      },
    });
    const session = createPieceMoveSession(
      store.getState(),
      ['a', 'b'],
      'a',
      null,
      pointer(10, 10),
    );
    if (!session) throw new Error('Missing move session');

    const preview = previewPieceMove(
      store.getState(),
      session,
      pointer(15.2, 15.2, {
        modifiers: { shift: false, alt: true, ctrl: false, meta: false },
      }),
    );
    expect(preview?.pieces.map((item) => item.id)).toEqual([
      'a',
      'b',
      'splash',
    ]);
    const movedA = preview?.pieces.find((item) => item.id === 'a');
    const movedSplash = preview?.pieces.find((item) => item.id === 'splash');
    expect(movedA?.pose.x).toBeCloseTo(15.2, 10);
    expect(movedSplash?.pose.x).toBeCloseTo(15.2, 10);
  });

  it('prefers object alignment within tolerance and allows Alt to bypass all snapping', () => {
    const { store } = setup();
    const session = createPieceMoveSession(
      store.getState(),
      ['a'],
      'a',
      null,
      pointer(10, 10),
    );
    if (!session) throw new Error('Missing move session');

    const snapped = previewPieceMove(
      store.getState(),
      session,
      pointer(60.4, 10),
    );
    const snappedA = snapped?.pieces.find((item) => item.id === 'a');
    expect(snappedA?.pose.x).toBe(60);
    expect(snapped?.guideX).toBe(80);

    const free = previewPieceMove(
      store.getState(),
      session,
      pointer(60.4, 10, {
        modifiers: { shift: false, alt: true, ctrl: false, meta: false },
      }),
    );
    expect(free?.pieces.find((item) => item.id === 'a')?.pose.x).toBeCloseTo(
      60.4,
      10,
    );
  });

  it('uses SLAB poses independently and applies fabrication clearance snapping', () => {
    const { store } = setup('slab');
    const session = createPieceMoveSession(
      store.getState(),
      ['a'],
      'a',
      null,
      pointer(10, 60),
    );
    if (!session) throw new Error('Missing move session');

    const preview = previewPieceMove(
      store.getState(),
      session,
      pointer(59.7, 60),
    );
    const moved = preview?.pieces.find((item) => item.id === 'a');
    expect(moved?.pose.x).toBeCloseTo(59.75, 10);
    expect(moved?.pose.y).toBe(60);
    expect(store.getState().project.layouts[0]?.pieces[0]?.x).toBe(10);
  });
});

describe('Piece resize projection', () => {
  it('uses friendly 1/8 inch sizing and keeps the opposite edge anchored', () => {
    const { store, commands } = setup();
    commands.execute({
      type: 'test.select',
      label: 'select',
      history: 'skip',
      persistence: 'skip',
      reduce(state) {
        return {
          ...state,
          session: {
            ...state.session,
            selection: { kind: 'pieces', ids: ['target'] },
          },
        };
      },
    });
    const session = createPieceResizeSession(
      store.getState(),
      'target',
      'right',
      pointer(100, 15),
    );
    if (!session) throw new Error('Missing resize session');

    const preview = previewPieceResize(
      store.getState(),
      session,
      pointer(103.11, 15, {
        modifiers: { shift: false, alt: true, ctrl: false, meta: false },
      }),
    );
    const item = preview?.pieces[0];
    expect(item?.geometry?.width).toBe(23.11);
    expect(item?.pose.x).toBe(80);

    const quantized = previewPieceResize(
      store.getState(),
      session,
      pointer(103.11, 15),
    );
    expect(quantized?.pieces[0]?.geometry?.width).toBe(23.125);
  });

  it('is DESIGN-only, single-selection-only, and hides seam-locked sides', () => {
    const state = applicationStateFromLegacyPayload(fixture());
    const layout = state.project.layouts[0];
    if (!layout) throw new Error('Missing Layout');
    const target = layout.pieces.find((piece) => piece.id === 'target');
    if (!target) throw new Error('Missing Piece');
    target.assemblyLinks = [
      {
        id: 'join',
        kind: 'seam',
        matePieceId: 'a',
        sourceSeamId: null,
        side: 'right',
      },
    ];
    state.session.selection = { kind: 'pieces', ids: ['target'] };
    expect(
      createPieceResizeSession(
        state,
        'target',
        'right',
        pointer(100, 15),
      ),
    ).toBeNull();

    state.session.workspace = 'slab';
    expect(
      createPieceResizeSession(
        state,
        'target',
        'left',
        pointer(80, 15),
      ),
    ).toBeNull();
  });
});

describe('Piece interaction controller and commands', () => {
  it('keeps click selection out of history and commits a drag as one history step', () => {
    const { store, controller } = setup();
    const history = new HistoryManager(store);
    history.start();

    controller.beginPiece('target', pointer(85, 15));
    controller.pointerUp(pointer(85, 15, { buttons: 0 }));
    expect(store.getState().session.selection).toEqual({
      kind: 'pieces',
      ids: ['target'],
    });
    expect(history.getStatus().size).toBe(1);

    controller.beginPiece('target', pointer(85, 15));
    controller.pointerMove(
      pointer(90.5, 20.25, {
        modifiers: { shift: false, alt: true, ctrl: false, meta: false },
      }),
    );
    controller.pointerUp(pointer(90.5, 20.25, { buttons: 0 }));

    expect(history.getStatus()).toMatchObject({
      size: 2,
      undoLabel: 'Move pieces',
    });
    expect(
      store.getState().project.layouts[0]?.pieces.find(
        (piece) => piece.id === 'target',
      ),
    ).toMatchObject({ x: 85.5, y: 15.25 });

    history.undo();
    expect(
      store.getState().project.layouts[0]?.pieces.find(
        (piece) => piece.id === 'target',
      ),
    ).toMatchObject({ x: 80, y: 10 });
    history.stop();
  });

  it('updates only the requested workspace pose and detaches a moved snapped splash', () => {
    const { store, commands } = setup();
    const layout = store.getState().project.layouts[0];
    const splash = layout?.pieces.find((piece) => piece.id === 'splash');
    if (!layout || !splash) throw new Error('Missing fixture');

    commands.execute(
      transformPieces(
        layout.id,
        [
          {
            id: splash.id,
            designPose: {
              x: 22.123456,
              y: splash.y,
              rotation: splash.rotation,
            },
          },
        ],
        { label: 'Move pieces' },
      ),
    );

    const moved = store
      .getState()
      .project.layouts[0]?.pieces.find((piece) => piece.id === 'splash');
    expect(moved?.x).toBe(22.123456);
    expect(moved?.slabPlacement.x).toBe(5);
    expect(moved?.attachment?.snapped).toBe(false);
  });

  it('preserves explicit decimal transforms without command-layer rounding', () => {
    const pieces = normalizePieces(
      [
        {
          id: 'precise',
          areaId: 'a',
          w: 81.997123,
          h: 25.5007,
          x: 1,
          y: 2,
          rotation: 0,
        },
      ],
      ['a'],
      'test',
    );
    const state = applicationStateFromLegacyPayload(fixture());
    const layout = state.project.layouts[0];
    if (!layout) throw new Error('Missing Layout');
    layout.pieces = pieces;
    const store = new AppStore(state);
    const commands = new CommandDispatcher(store);

    commands.execute(
      transformPieces(
        layout.id,
        [
          {
            id: 'precise',
            designPose: {
              x: 4.1234567,
              y: 8.7654321,
              rotation: normalizeDegrees(361.234567),
            },
          },
        ],
      ),
    );

    expect(store.getState().project.layouts[0]?.pieces[0]).toMatchObject({
      w: 81.997123,
      x: 4.1234567,
      y: 8.7654321,
      rotation: 1.2345670000000037,
    });
  });
});
