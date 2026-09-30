import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  HistoryManager,
  addPieceSink,
  applicationStateFromLegacyPayload,
  copyPieceSink,
  editPieceSink,
  removePieceSink,
  updatePreferences,
} from '../src/app';
import {
  DEFAULT_FAUCET_HOLE_DIAMETER,
  DEFAULT_FAUCET_SETBACK,
  DEFAULT_FAUCET_SPACING,
  MAX_SINKS_PER_PIECE,
  SINK_STANDARD_SETBACK,
  SINK_MODELS,
  applySinkModel,
  createDefaultSink,
  duplicatePieceSink,
  pieceSinkLocalPose,
  sinkFaucetHoles,
  sinkReferenceAngle,
  updatePieceSink,
} from '../src/domain/pieces';
import {
  createPieceCanvasProjection,
  projectPieceForCanvas,
} from '../src/browser/piece-canvas-model';
import {
  migrateCadLiteFile,
} from '../src/persistence';
import { normalizePieces } from '../src/persistence/pieces';

function payload(
  workspace: 'design' | 'slab' = 'design',
  convention = 'front-bottom-v1',
) {
  return {
    sinkSideConvention: convention,
    project: { name: 'Sinks', date: '2026-09-30', notes: '' },
    materials: [],
    layouts: [
      {
        id: 'layout',
        name: 'Layout',
        quantity: 1,
        cw: 220,
        ch: 140,
        scale: 8,
        grid: 1,
        showGrid: true,
        pieceFillOpacity: 1,
        slabCW: 220,
        slabCH: 140,
        areas: [{ id: 'a', name: 'A' }],
        activeAreaId: 'a',
        pieces: [
          {
            id: 'p',
            name: 'P',
            areaId: 'a',
            x: 10,
            y: 20,
            w: 60,
            h: 25,
            rotation: 30,
            color: '#ffffff',
            layer: 1,
            slabPlacement: { x: 90, y: 10, rotation: 90 },
            sinks: [
              {
                id: 'sink-front',
                name: 'Kitchen',
                type: 'model',
                modelId: 'k3218-single',
                shape: 'rect',
                w: 31,
                h: 17,
                cornerR: 4,
                side: 'front',
                centerline: 20,
                setback: 3.125,
                rotation: 15,
                faucets: [2, 4, 6],
                faucetSetback: 2.5,
                faucetHoleDiameter: 1.5,
                faucetHoleSpacing: 2,
                insideFinish: 'polished',
              },
              {
                id: 'sink-split',
                name: '',
                type: 'custom',
                modelId: null,
                shape: 'oval',
                w: 18,
                h: 13,
                cornerR: 0,
                side: 'back',
                centerline: 40,
                setback: 2,
                rotation: 0,
                faucets: [4],
                faucetSetback: 2.5,
                faucetHoleDiameter: 1.5,
                faucetHoleSpacing: 2,
                insideFinish: 'unpolished',
                fabricationSplitSinkId: 'split-1',
                fabricationPose: { cx: 48, cy: 8 },
              },
            ],
            cutouts: [],
            pieceSeams: [],
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
      gridSnap: true,
      pieceSnap: true,
      showSinkCenterlines: true,
      showSeams: true,
      showGrid: true,
      showDims: true,
      dimPrecision: 16,
      dimFormat: 'fraction',
    },
    active: 0,
  };
}

function setup(workspace: 'design' | 'slab' = 'design') {
  const state = applicationStateFromLegacyPayload(payload(workspace));
  const store = new AppStore(state);
  return {
    store,
    commands: new CommandDispatcher(store),
  };
}

describe('typed sink persistence', () => {
  it('normalizes known sink fields and preserves unknown compatibility metadata', () => {
    const [piece] = normalizePieces(
      [
        {
          id: 'p',
          areaId: 'a',
          w: 60,
          h: 25,
          sinks: [
            {
              id: 'sink',
              name: 'Precise',
              type: 'custom',
              shape: 'oval',
              w: 18.12345,
              h: 13.6789,
              cornerR: 9,
              side: 'right',
              centerline: 12.34567,
              setback: 0,
              rotation: 400,
              faucets: [8, 4, 4, -1, 9, 2.2],
              faucetSetback: 2.55555,
              faucetHoleDiameter: 1.23456,
              faucetHoleSpacing: 2.34567,
              insideFinish: 'unpolished',
              fabricationSplitSinkId: 'split',
              fabricationPose: { cx: 44.125, cy: 8.875 },
              futureMeta: 'keep',
            },
          ],
        },
      ],
      ['a'],
      'piece',
    );

    expect(piece?.sinks[0]).toMatchObject({
      id: 'sink',
      name: 'Precise',
      type: 'custom',
      modelId: null,
      shape: 'oval',
      w: 18.12345,
      h: 13.6789,
      cornerR: 4,
      side: 'right',
      centerline: 12.34567,
      setback: 0,
      rotation: 360,
      faucets: [2, 4, 8],
      faucetSetback: 2.556,
      faucetHoleDiameter: 1.235,
      faucetHoleSpacing: 2.346,
      insideFinish: 'unpolished',
      fabricationSplitSinkId: 'split',
      fabricationPose: { cx: 44.125, cy: 8.875 },
      futureMeta: 'keep',
    });
  });

  it('applies production faucet defaults and deterministic duplicate IDs', () => {
    const [piece] = normalizePieces(
      [
        {
          id: 'p',
          areaId: 'a',
          sinks: [
            { id: 'same', w: 10, h: 10 },
            { id: 'same', w: 10, h: 10 },
          ],
        },
      ],
      ['a'],
      'piece',
    );

    expect(piece?.sinks.map((sink) => sink.id)).toEqual([
      'same',
      'same-duplicate',
    ]);
    expect(piece?.sinks[0]).toMatchObject({
      faucetSetback: DEFAULT_FAUCET_SETBACK,
      faucetHoleDiameter: DEFAULT_FAUCET_HOLE_DIAMETER,
      faucetHoleSpacing: DEFAULT_FAUCET_SPACING,
      insideFinish: 'polished',
    });
  });

  it('migrates the pre-front-bottom legacy side convention exactly once', () => {
    const old = migrateCadLiteFile(payload('design', 'front-v2'));
    const current = migrateCadLiteFile(payload());

    expect(old.project.layouts[0]?.pieces[0]?.sinks[0]?.side).toBe('back');
    expect(old.project.layouts[0]?.pieces[0]?.sinks[1]?.side).toBe('front');
    expect(current.project.layouts[0]?.pieces[0]?.sinks[0]?.side).toBe(
      'front',
    );
  });
});

describe('sink domain geometry', () => {
  it('creates the v1.5.99 default kitchen sink', () => {
    const sink = createDefaultSink('new-sink');
    expect(sink).toMatchObject({
      id: 'new-sink',
      type: 'model',
      modelId: 'k3218-single',
      shape: 'rect',
      w: 31,
      h: 17,
      cornerR: 4,
      side: 'front',
      centerline: 20,
      setback: SINK_STANDARD_SETBACK,
      faucets: [4],
      faucetSetback: DEFAULT_FAUCET_SETBACK,
      faucetHoleDiameter: DEFAULT_FAUCET_HOLE_DIAMETER,
      faucetHoleSpacing: DEFAULT_FAUCET_SPACING,
      insideFinish: 'polished',
      rotation: 0,
    });
  });

  it('uses production reference-side angles and Piece-local sink centers', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    const sink = piece?.sinks[0];
    if (!piece || !sink) throw new Error('Missing sink fixture');

    expect(sinkReferenceAngle('front')).toBe(0);
    expect(sinkReferenceAngle('left')).toBe(90);
    expect(sinkReferenceAngle('back')).toBe(180);
    expect(sinkReferenceAngle('right')).toBe(270);

    expect(pieceSinkLocalPose(piece, sink)).toMatchObject({
      cx: 20,
      cy: 13.375,
      angle: 15,
      sinkRect: {
        x: 4.5,
        y: 4.875,
        w: 31,
        h: 17,
      },
    });
  });

  it('treats fabricationPose as authoritative for split sink fragments', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    const sink = piece?.sinks[1];
    if (!piece || !sink) throw new Error('Missing split sink fixture');

    expect(pieceSinkLocalPose(piece, sink)).toMatchObject({
      cx: 48,
      cy: 8,
      angle: 180,
    });
  });

  it('projects faucet holes on the sink local back edge', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const sink = state.project.layouts[0]?.pieces[0]?.sinks[0];
    if (!sink) throw new Error('Missing sink fixture');

    expect(sinkFaucetHoles(sink)).toEqual([
      { index: 2, x: -4, y: -11, radius: 0.75 },
      { index: 4, x: 0, y: -11, radius: 0.75 },
      { index: 6, x: 4, y: -11, radius: 0.75 },
    ]);
  });

  it('applies model geometry and production Inspector edit rules', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    if (!piece) throw new Error('Missing Piece');

    const custom = updatePieceSink(piece, 'sink-front', {
      type: 'custom',
      w: 22.1236,
      h: 14.9876,
      rotation: 45.6,
      cornerR: 1.2346,
      centerline: 75.4321,
      faucetSetback: 2.3333,
    });
    const sink = custom?.sinks[0];
    expect(sink).toMatchObject({
      type: 'custom',
      w: 22.124,
      h: 14.988,
      rotation: 46,
      cornerR: 1.235,
      centerline: 75.432,
      faucetSetback: 2.333,
    });

    if (!custom) throw new Error('Missing edited Piece');
    const sideChanged = updatePieceSink(custom, 'sink-front', {
      side: 'left',
    });
    expect(sideChanged?.sinks[0]).toMatchObject({
      side: 'left',
      centerline: 25,
    });

    if (!sideChanged) throw new Error('Missing side edit');
    const modeled = updatePieceSink(sideChanged, 'sink-front', {
      type: 'model',
      modelId: 'oval-1714',
    });
    expect(modeled?.sinks[0]).toMatchObject({
      type: 'model',
      modelId: 'oval-1714',
      shape: 'oval',
      w: 17,
      h: 14,
      cornerR: 0,
    });
  });

  it('duplicates immediately after the source and enforces the four-sink limit', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    if (!piece) throw new Error('Missing Piece');

    const renamed = updatePieceSink(piece, 'sink-front', {
      name: 'Main',
    });
    if (!renamed) throw new Error('Missing renamed Piece');

    const duplicated = duplicatePieceSink(
      renamed,
      'sink-front',
      'sink-copy',
    );
    expect(duplicated?.sinks.map((sink) => sink.id)).toEqual([
      'sink-front',
      'sink-copy',
      'sink-split',
    ]);
    expect(duplicated?.sinks[1]?.name).toBe('Main Copy');

    if (!duplicated) throw new Error('Missing duplicate');
    const four = duplicatePieceSink(
      duplicated,
      'sink-front',
      'sink-4',
    );
    if (!four) throw new Error('Missing fourth sink');
    expect(four.sinks).toHaveLength(MAX_SINKS_PER_PIECE);
    expect(
      duplicatePieceSink(four, 'sink-front', 'sink-5'),
    ).toBeNull();
  });

  it('applies the selected catalog model deterministically', () => {
    const sink = createDefaultSink('sink');
    if (!sink) throw new Error('Missing default sink');
    const model = SINK_MODELS.find((item) => item.id === 'rect-1813');
    if (!model) throw new Error('Missing model fixture');

    expect(applySinkModel(sink, model.id)).toMatchObject({
      modelId: 'rect-1813',
      shape: 'rect',
      w: 18,
      h: 13,
      cornerR: 0.25,
    });
  });
});

describe('sink commands and history', () => {
  it('adds, edits, duplicates, and removes sinks as undoable commands', () => {
    const { store, commands } = setup();
    const history = new HistoryManager(store);
    history.start();

    expect(
      commands.execute(addPieceSink('layout', 'p', 'new-sink')),
    ).not.toBeNull();
    expect(history.getStatus()).toMatchObject({
      size: 2,
      undoLabel: 'Add sink',
    });

    expect(
      commands.execute(
        editPieceSink('layout', 'p', 'new-sink', {
          type: 'custom',
          w: 24.1254,
          name: 'Prep',
        }),
      ),
    ).not.toBeNull();
    expect(
      store
        .getState()
        .project.layouts[0]?.pieces[0]?.sinks.find(
          (sink) => sink.id === 'new-sink',
        ),
    ).toMatchObject({
      type: 'custom',
      w: 24.125,
      name: 'Prep',
    });

    expect(
      commands.execute(
        copyPieceSink('layout', 'p', 'new-sink', 'copy-sink'),
      ),
    ).not.toBeNull();
    expect(
      store.getState().project.layouts[0]?.pieces[0]?.sinks.map(
        (sink) => sink.id,
      ),
    ).toEqual(['sink-front', 'sink-split', 'new-sink', 'copy-sink']);

    expect(
      commands.execute(
        removePieceSink('layout', 'p', 'copy-sink'),
      ),
    ).not.toBeNull();

    history.undo();
    expect(
      store
        .getState()
        .project.layouts[0]?.pieces[0]?.sinks.some(
          (sink) => sink.id === 'copy-sink',
        ),
    ).toBe(true);
    history.stop();
  });

  it('rejects duplicate IDs and the fifth sink without history', () => {
    const { store, commands } = setup();
    const history = new HistoryManager(store);
    history.start();

    expect(
      commands.execute(addPieceSink('layout', 'p', 'sink-front')),
    ).toBeNull();

    expect(commands.execute(addPieceSink('layout', 'p', 'three'))).not.toBeNull();
    expect(commands.execute(addPieceSink('layout', 'p', 'four'))).not.toBeNull();
    expect(
      store.getState().project.layouts[0]?.pieces[0]?.sinks,
    ).toHaveLength(4);
    const size = history.getStatus().size;

    expect(commands.execute(addPieceSink('layout', 'p', 'five'))).toBeNull();
    expect(history.getStatus().size).toBe(size);
    history.stop();
  });
});

describe('sink canvas projection', () => {
  it('projects sink/faucet geometry in Piece-local coordinates', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const projection = createPieceCanvasProjection(state);
    const piece = projection.pieces[0];
    const sink = piece?.sinks.find((item) => item.id === 'sink-front');
    if (!piece || !sink) throw new Error('Missing projected sink');

    expect(sink.center.x - piece.localRect.x).toBeCloseTo(20, 12);
    expect(sink.center.y - piece.localRect.y).toBeCloseTo(13.375, 12);
    expect(sink.localRotation).toBe(15);
    expect(sink.shape).toBe('rect');
    expect(sink.path).toContain('M');
    expect(sink.faucets).toEqual([
      { index: 2, x: -4, y: -11, radius: 0.75 },
      { index: 4, x: 0, y: -11, radius: 0.75 },
      { index: 6, x: 4, y: -11, radius: 0.75 },
    ]);
    expect(sink.showCenterline).toBe(true);
  });

  it('uses the same local sink geometry in SLAB while Piece pose remains independent', () => {
    const state = applicationStateFromLegacyPayload(payload('slab'));
    const projection = createPieceCanvasProjection(state);
    const piece = projection.pieces[0];
    const sink = piece?.sinks.find((item) => item.id === 'sink-front');
    if (!piece || !sink) throw new Error('Missing projected sink');

    expect(piece.pose).toEqual({ x: 90, y: 10, rotation: 90 });
    expect(sink.center.x - piece.localRect.x).toBeCloseTo(20, 12);
    expect(sink.center.y - piece.localRect.y).toBeCloseTo(13.375, 12);
    expect(sink.localRotation).toBe(15);
  });

  it('marks split sink fragments for clipping and suppresses their centerline dimension', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const projection = createPieceCanvasProjection(state);
    const piece = projection.pieces[0];
    const sink = piece?.sinks.find((item) => item.id === 'sink-split');
    if (!piece || !sink) throw new Error('Missing split sink');

    expect(sink.split).toBe(true);
    expect(sink.showCenterline).toBe(false);
    expect(sink.center.x - piece.localRect.x).toBeCloseTo(48, 12);
    expect(sink.center.y - piece.localRect.y).toBeCloseTo(8, 12);
  });

  it('honors centerline visibility without removing sink geometry', () => {
    const { store, commands } = setup();
    commands.execute(updatePreferences({ showSinkCenterlines: false }));
    const projection = createPieceCanvasProjection(store.getState());

    expect(projection.pieces[0]?.sinks).toHaveLength(2);
    expect(
      projection.pieces[0]?.sinks.every(
        (sink) => sink.showCenterline === false,
      ),
    ).toBe(true);
  });

  it('recomputes reference-positioned sinks against transient resize geometry', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const source = state.project.layouts[0]?.pieces[0];
    if (!source) throw new Error('Missing Piece');

    const projected = projectPieceForCanvas(
      source,
      'design',
      {
        showPieceFills: true,
        pieceFillOpacity: 1,
        showSeams: true,
        showSinkCenterlines: true,
      },
      0,
      {
        id: source.id,
        geometry: {
          kind: 'rectangle',
          width: 60,
          height: 30,
          cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 },
        },
        pose: { x: 10, y: 20, rotation: 30 },
      },
    );

    const normal = projected.sinks.find(
      (sink) => sink.id === 'sink-front',
    );
    const split = projected.sinks.find(
      (sink) => sink.id === 'sink-split',
    );

    expect(
      normal ? normal.center.y - projected.localRect.y : null,
    ).toBeCloseTo(18.375, 12);
    expect(
      split ? split.center.y - projected.localRect.y : null,
    ).toBeCloseTo(8, 12);
  });
});
