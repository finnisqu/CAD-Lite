import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  HistoryManager,
  addPieceCutout,
  applicationStateFromLegacyPayload,
  copyPieceCutout,
  editPieceCutout,
  removePieceCutout,
  updatePreferences,
} from '../src/app';
import {
  applyCutoutKind,
  createDefaultCutout,
  cutoutEffectivePerimeterInches,
  cutoutLabelOffset,
  cutoutLocalBounds,
  cutoutPerimeterInches,
  defaultCutoutName,
  duplicatePieceCutout,
  updatePieceCutout,
} from '../src/domain/pieces';
import {
  createPieceCanvasProjection,
  projectPieceForCanvas,
} from '../src/browser/piece-canvas-model';
import { normalizePieces } from '../src/persistence/pieces';

function payload(workspace: 'design' | 'slab' = 'design') {
  return {
    sinkSideConvention: 'front-bottom-v1',
    project: { name: 'Cutouts', date: '2026-09-30', notes: '' },
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
            h: 30,
            rotation: 30,
            color: '#ffffff',
            layer: 1,
            cornerRadii: { tl: 2, tr: 0, br: 0, bl: 0 },
            slabPlacement: { x: 90, y: 10, rotation: 90 },
            sinks: [],
            cutouts: [
              {
                id: 'rect',
                name: 'Cooktop',
                kind: 'rectangle',
                cx: 50,
                cy: 15,
                w: 20,
                h: 10,
                cornerR: 1,
                rotation: 15,
                insideFinish: 'polished',
              },
              {
                id: 'circle',
                name: 'Grommet',
                kind: 'circle',
                cx: 10,
                cy: 8,
                diameter: 3,
                w: 3,
                h: 3,
                cornerR: 1.5,
                rotation: 0,
                insideFinish: 'unpolished',
              },
              {
                id: 'split',
                name: 'Split Oval',
                kind: 'oval',
                cx: 64,
                cy: 12,
                w: 18,
                h: 8,
                cornerR: 0,
                rotation: 20,
                insideFinish: 'polished',
                fabricationSplitCutoutId: 'split-1',
              },
            ],
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
      showCutoutLabels: true,
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

describe('typed cutout persistence', () => {
  it('normalizes legacy kinds, geometry, finish, and Piece-local centers', () => {
    const [piece] = normalizePieces(
      [
        {
          id: 'p',
          areaId: 'a',
          w: 40,
          h: 20,
          cutouts: [
            {
              id: 'legacy',
              kind: 'cooktop',
              name: '',
              cx: 100,
              cy: -5,
              w: 0,
              h: 0,
              cornerR: 99,
              rotation: -30,
              insideFinish: 'something',
              futureMeta: 'keep',
            },
          ],
        },
      ],
      ['a'],
      'piece',
    );

    expect(piece?.cutouts[0]).toMatchObject({
      id: 'legacy',
      kind: 'rectangle',
      name: 'Rectangular Cutout',
      cx: 40,
      cy: 0,
      w: 6,
      h: 4,
      cornerR: 2,
      rotation: 330,
      insideFinish: 'unpolished',
      fabricationSplitCutoutId: null,
      futureMeta: 'keep',
    });
  });

  it('normalizes circles/ovals and preserves split centers outside a child Piece', () => {
    const [piece] = normalizePieces(
      [
        {
          id: 'p',
          areaId: 'a',
          w: 30,
          h: 20,
          cutouts: [
            {
              id: 'circle',
              kind: 'circle',
              w: 4.25,
              rotation: 90,
              insideFinish: 'polished',
            },
            {
              id: 'oval',
              kind: 'oval',
              w: 8,
              h: 5,
              cornerR: 2,
              rotation: 725.125,
            },
            {
              id: 'split',
              kind: 'rectangle',
              cx: 38.125,
              cy: -3.5,
              w: 10,
              h: 6,
              fabricationSplitCutoutId: 'shared',
            },
          ],
        },
      ],
      ['a'],
      'piece',
    );

    expect(piece?.cutouts[0]).toMatchObject({
      diameter: 4.25,
      w: 4.25,
      h: 4.25,
      cornerR: 2.125,
      rotation: 0,
      insideFinish: 'polished',
    });
    expect(piece?.cutouts[1]).toMatchObject({
      kind: 'oval',
      cornerR: 0,
      rotation: 5.125,
      insideFinish: 'unpolished',
    });
    expect(piece?.cutouts[2]).toMatchObject({
      cx: 38.125,
      cy: -3.5,
      fabricationSplitCutoutId: 'shared',
    });
  });

  it('keeps duplicate cutout IDs deterministic', () => {
    const [piece] = normalizePieces(
      [
        {
          id: 'p',
          areaId: 'a',
          cutouts: [
            { id: 'same', kind: 'rectangle' },
            { id: 'same', kind: 'circle' },
          ],
        },
      ],
      ['a'],
      'piece',
    );

    expect(piece?.cutouts.map((cutout) => cutout.id)).toEqual([
      'same',
      'same-duplicate',
    ]);
  });
});

describe('cutout domain geometry', () => {
  it('creates production defaults centered on the Piece', () => {
    const piece = { w: 60, h: 30 };
    const rectangle = createDefaultCutout('rectangle', piece, 'r');
    const circle = createDefaultCutout('circle', piece, 'c');
    const oval = createDefaultCutout('oval', piece, 'o');

    expect(rectangle).toMatchObject({
      id: 'r',
      name: 'Rectangular Cutout',
      kind: 'rectangle',
      cx: 30,
      cy: 15,
      w: 6,
      h: 4,
      cornerR: 0,
      rotation: 0,
      insideFinish: 'unpolished',
    });
    expect(circle).toMatchObject({
      name: 'Circular Cutout',
      diameter: 2,
      w: 2,
      h: 2,
      cornerR: 1,
      rotation: 0,
    });
    expect(oval).toMatchObject({
      name: 'Oval Cutout',
      w: 6,
      h: 4,
      cornerR: 0,
      rotation: 0,
    });
  });

  it('changes kind with production defaults while preserving custom names', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    const source = piece?.cutouts[0];
    if (!piece || !source) throw new Error('Missing cutout');

    const generic = {
      ...source,
      name: defaultCutoutName('rectangle'),
    };
    expect(applyCutoutKind(generic, 'circle', piece)).toMatchObject({
      kind: 'circle',
      name: 'Circular Cutout',
      diameter: 2,
      w: 2,
      h: 2,
      rotation: 0,
    });

    expect(
      applyCutoutKind({ ...source, name: 'Range' }, 'oval', piece),
    ).toMatchObject({
      kind: 'oval',
      name: 'Range',
      w: 6,
      h: 4,
      rotation: 0,
    });
  });

  it('applies Inspector edit rules including CL clamping on split cutouts', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    if (!piece) throw new Error('Missing Piece');

    const edited = updatePieceCutout(piece, 'rect', {
      w: 22.1236,
      h: 11.9876,
      cx: 100,
      cy: -3,
      rotation: -45.1254,
      cornerR: 20,
      insideFinish: 'unpolished',
    });
    expect(edited?.cutouts[0]).toMatchObject({
      w: 22.124,
      h: 11.988,
      cx: 60,
      cy: 0,
      rotation: 314.875,
      cornerR: 5.994,
      insideFinish: 'unpolished',
    });

    const split = updatePieceCutout(piece, 'split', {
      cx: 100,
      cy: -5,
    });
    expect(
      split?.cutouts.find((cutout) => cutout.id === 'split'),
    ).toMatchObject({
      cx: 60,
      cy: 0,
      fabricationSplitCutoutId: 'split-1',
    });
  });

  it('duplicates after the source, offsets by one inch, and clears split identity', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    if (!piece) throw new Error('Missing Piece');

    const duplicated = duplicatePieceCutout(piece, 'split', 'copy');
    expect(duplicated?.cutouts.map((cutout) => cutout.id)).toEqual([
      'rect',
      'circle',
      'split',
      'copy',
    ]);
    expect(duplicated?.cutouts[3]).toMatchObject({
      id: 'copy',
      name: 'Split Oval Copy',
      cx: 60,
      cy: 13,
      fabricationSplitCutoutId: null,
    });
  });

  it('calculates full and clipped cut-edge perimeter', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    const circle = piece?.cutouts.find((cutout) => cutout.id === 'circle');
    const rectangle = piece?.cutouts.find((cutout) => cutout.id === 'rect');
    if (!piece || !circle || !rectangle) {
      throw new Error('Missing cutout fixture');
    }

    expect(cutoutPerimeterInches(circle)).toBeCloseTo(3 * Math.PI, 12);
    expect(cutoutPerimeterInches(rectangle)).toBeGreaterThan(50);
    expect(
      cutoutEffectivePerimeterInches(rectangle, piece),
    ).toBeLessThan(cutoutPerimeterInches(rectangle));
  });

  it('projects rotated local bounds and split label offsets', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    const split = piece?.cutouts.find((cutout) => cutout.id === 'split');
    if (!piece || !split) throw new Error('Missing split cutout');

    const bounds = cutoutLocalBounds(split);
    expect(bounds.maxX).toBeGreaterThan(piece.w);
    expect(cutoutLabelOffset(split, piece).x).toBeLessThan(0);
  });
});

describe('cutout commands and history', () => {
  it('adds, edits, duplicates, removes, and undoes cutouts', () => {
    const { store, commands } = setup();
    const history = new HistoryManager(store);
    history.start();

    expect(
      commands.execute(
        addPieceCutout('layout', 'p', 'rectangle', 'new-cutout'),
      ),
    ).not.toBeNull();
    expect(history.getStatus()).toMatchObject({
      size: 2,
      undoLabel: 'Add cutout',
    });

    expect(
      commands.execute(
        editPieceCutout('layout', 'p', 'new-cutout', {
          name: 'Outlet',
          kind: 'circle',
          diameter: 2.75,
          insideFinish: 'polished',
        }),
      ),
    ).not.toBeNull();
    expect(
      store
        .getState()
        .project.layouts[0]?.pieces[0]?.cutouts.find(
          (cutout) => cutout.id === 'new-cutout',
        ),
    ).toMatchObject({
      name: 'Outlet',
      kind: 'circle',
      diameter: 2.75,
      insideFinish: 'polished',
    });

    expect(
      commands.execute(
        copyPieceCutout('layout', 'p', 'new-cutout', 'copy-cutout'),
      ),
    ).not.toBeNull();

    expect(
      commands.execute(
        removePieceCutout('layout', 'p', 'copy-cutout'),
      ),
    ).not.toBeNull();

    history.undo();
    expect(
      store
        .getState()
        .project.layouts[0]?.pieces[0]?.cutouts.some(
          (cutout) => cutout.id === 'copy-cutout',
        ),
    ).toBe(true);
    history.stop();
  });

  it('rejects duplicate IDs and unknown edits without history', () => {
    const { store, commands } = setup();
    const history = new HistoryManager(store);
    history.start();

    expect(
      commands.execute(
        addPieceCutout('layout', 'p', 'rectangle', 'rect'),
      ),
    ).toBeNull();
    expect(
      commands.execute(
        editPieceCutout('layout', 'p', 'missing', { cx: 2 }),
      ),
    ).toBeNull();
    expect(history.getStatus().size).toBe(1);
    history.stop();
  });
});

describe('cutout canvas projection', () => {
  it('projects rectangle/circle/oval geometry and polished styling metadata', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const projection = createPieceCanvasProjection(state);
    const piece = projection.pieces[0];
    if (!piece) throw new Error('Missing projected Piece');

    const rectangle = piece.cutouts.find((cutout) => cutout.id === 'rect');
    const circle = piece.cutouts.find((cutout) => cutout.id === 'circle');
    const oval = piece.cutouts.find((cutout) => cutout.id === 'split');

    expect(rectangle).toMatchObject({
      kind: 'rectangle',
      localRotation: 15,
      polished: true,
      showLabel: true,
    });
    expect(rectangle?.path).toContain('M');

    expect(circle).toMatchObject({
      kind: 'circle',
      localRotation: 0,
      diameter: 3,
      polished: false,
    });
    expect(circle?.path).toBeNull();

    expect(oval).toMatchObject({
      kind: 'oval',
      localRotation: 20,
      polished: true,
      split: true,
    });
  });

  it('uses identical Piece-local cutout geometry in SLAB', () => {
    const state = applicationStateFromLegacyPayload(payload('slab'));
    const projection = createPieceCanvasProjection(state);
    const piece = projection.pieces[0];
    const rectangle = piece?.cutouts.find(
      (cutout) => cutout.id === 'rect',
    );
    if (!piece || !rectangle) throw new Error('Missing cutout');

    expect(piece.pose).toEqual({ x: 90, y: 10, rotation: 90 });
    expect(rectangle.center.x - piece.localRect.x).toBeCloseTo(50, 12);
    expect(rectangle.center.y - piece.localRect.y).toBeCloseTo(15, 12);
    expect(rectangle.localRotation).toBe(15);
  });

  it('hides labels without removing cutout geometry', () => {
    const { store, commands } = setup();
    commands.execute(updatePreferences({ showCutoutLabels: false }));
    const projection = createPieceCanvasProjection(store.getState());

    expect(projection.pieces[0]?.cutouts).toHaveLength(3);
    expect(
      projection.pieces[0]?.cutouts.every(
        (cutout) => cutout.showLabel === false,
      ),
    ).toBe(true);
  });

  it('moves split labels toward the fragment visible on the child Piece', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const projection = createPieceCanvasProjection(state);
    const split = projection.pieces[0]?.cutouts.find(
      (cutout) => cutout.id === 'split',
    );
    if (!split) throw new Error('Missing split cutout');

    expect(split.labelOffset.x).toBeLessThan(0);
    expect(split.showLabel).toBe(true);
  });

  it('clamps normal cutout centers against transient resize geometry but preserves split centers', () => {
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
        showCutoutLabels: true,
      },
      0,
      {
        id: source.id,
        geometry: {
          kind: 'rectangle',
          width: 45,
          height: 30,
          cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 },
        },
        pose: { x: 10, y: 20, rotation: 30 },
      },
    );

    const normal = projected.cutouts.find(
      (cutout) => cutout.id === 'rect',
    );
    const split = projected.cutouts.find(
      (cutout) => cutout.id === 'split',
    );

    expect(
      normal ? normal.center.x - projected.localRect.x : null,
    ).toBeCloseTo(45, 12);
    expect(
      split ? split.center.x - projected.localRect.x : null,
    ).toBeCloseTo(64, 12);
  });
});
