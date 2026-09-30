import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  HistoryManager,
  applicationStateFromLegacyPayload,
  addPieceSeam,
  editPieceSeam,
  removePieceSeam,
  updatePreferences,
} from '../src/app';
import {
  createPieceSeam,
  deletePieceSeam,
  pieceSeamLocalCoordinate,
  updatePieceSeam,
} from '../src/domain/pieces';
import {
  createPieceCanvasProjection,
  projectPieceForCanvas,
} from '../src/browser/piece-canvas-model';
import { normalizePieces } from '../src/persistence/pieces';

function payload(workspace: 'design' | 'slab' = 'design') {
  return {
    sinkSideConvention: 'front-bottom-v1',
    project: { name: 'Seams', date: '2026-09-30', notes: '' },
    materials: [],
    layouts: [
      {
        id: 'layout',
        name: 'Layout',
        quantity: 1,
        cw: 200,
        ch: 120,
        scale: 8,
        grid: 1,
        showGrid: true,
        pieceFillOpacity: 1,
        slabCW: 200,
        slabCH: 120,
        areas: [{ id: 'a', name: 'A' }],
        activeAreaId: 'a',
        pieces: [
          {
            id: 'p',
            name: 'P',
            areaId: 'a',
            x: 10,
            y: 20,
            w: 40,
            h: 20,
            rotation: 0,
            color: '#ffffff',
            layer: 1,
            slabPlacement: { x: 70, y: 10, rotation: 0 },
            pieceSeams: [
              {
                id: 'vertical',
                orientation: 'vertical',
                reference: 'right',
                offset: 5,
              },
              {
                id: 'horizontal',
                orientation: 'horizontal',
                reference: 'bottom',
                offset: 4,
              },
            ],
            assemblyLinks: [
              {
                id: 'joint',
                kind: 'seam',
                matePieceId: 'q',
                sourceSeamId: 'vertical',
                side: 'right',
              },
            ],
          },
          {
            id: 'q',
            name: 'Q',
            areaId: 'a',
            x: 50,
            y: 20,
            w: 30,
            h: 20,
            rotation: 0,
            color: '#ffffff',
            layer: 2,
            slabPlacement: { x: 120, y: 10, rotation: 0 },
            assemblyLinks: [
              {
                id: 'joint',
                kind: 'seam',
                matePieceId: 'p',
                sourceSeamId: 'vertical',
                side: 'left',
              },
            ],
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

describe('typed Piece seam persistence', () => {
  it('normalizes orientation/reference/offset while preserving in-range precision', () => {
    const [piece] = normalizePieces(
      [
        {
          id: 'p',
          areaId: 'a',
          w: 40,
          h: 20,
          pieceSeams: [
            {
              id: 'precise',
              orientation: 'vertical',
              reference: 'right',
              offset: 12.12345,
              futureMeta: 'keep',
            },
            {
              id: 'bad',
              orientation: 'horizontal',
              reference: 'left',
              offset: 99,
            },
          ],
        },
      ],
      ['a'],
      'piece',
    );

    expect(piece?.pieceSeams[0]).toMatchObject({
      id: 'precise',
      orientation: 'vertical',
      reference: 'right',
      offset: 12.12345,
      futureMeta: 'keep',
    });
    expect(piece?.pieceSeams[1]).toMatchObject({
      id: 'bad',
      orientation: 'horizontal',
      reference: 'top',
      offset: 20,
    });
  });

  it('keeps duplicate seam IDs deterministic', () => {
    const [piece] = normalizePieces(
      [
        {
          id: 'p',
          areaId: 'a',
          pieceSeams: [
            { id: 'same', offset: 1 },
            { id: 'same', offset: 2 },
          ],
        },
      ],
      ['a'],
      'piece',
    );

    expect(piece?.pieceSeams.map((seam) => seam.id)).toEqual([
      'same',
      'same-duplicate',
    ]);
  });
});

describe('Piece seam domain edits', () => {
  it('uses production defaults and reference-relative coordinates', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    if (!piece) throw new Error('Missing Piece');

    expect(createPieceSeam(piece, 'new')).toEqual({
      id: 'new',
      orientation: 'vertical',
      reference: 'left',
      offset: 20,
    });
    expect(createPieceSeam(piece, 'vertical')).toBeNull();
    expect(pieceSeamLocalCoordinate(piece, piece.pieceSeams[0]!)).toBe(35);
    expect(pieceSeamLocalCoordinate(piece, piece.pieceSeams[1]!)).toBe(16);
  });

  it('resets the reference on orientation change and rounds edited offsets to 3 decimals', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    if (!piece) throw new Error('Missing Piece');

    const horizontal = updatePieceSeam(piece, 'vertical', {
      orientation: 'horizontal',
    });
    expect(horizontal?.pieceSeams[0]).toMatchObject({
      orientation: 'horizontal',
      reference: 'top',
      offset: 5,
    });

    const precise = horizontal
      ? updatePieceSeam(horizontal, 'vertical', { offset: 18.1236 })
      : null;
    expect(precise?.pieceSeams[0]?.offset).toBe(18.124);

    const invalidReference = precise
      ? updatePieceSeam(precise, 'vertical', { reference: 'left' })
      : null;
    expect(invalidReference).toBe(precise);
  });

  it('deletes only the requested planning seam', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    if (!piece) throw new Error('Missing Piece');

    const next = deletePieceSeam(piece, 'vertical');
    expect(next?.pieceSeams.map((seam) => seam.id)).toEqual(['horizontal']);
    expect(deletePieceSeam(piece, 'missing')).toBeNull();
  });
});

describe('Piece seam commands and history', () => {
  it('adds, edits, and removes seams through undoable commands', () => {
    const { store, commands } = setup();
    const history = new HistoryManager(store);
    history.start();

    expect(
      commands.execute(addPieceSeam('layout', 'p', 'new-seam')),
    ).not.toBeNull();
    expect(history.getStatus()).toMatchObject({
      size: 2,
      undoLabel: 'Add seam',
    });

    expect(
      commands.execute(
        editPieceSeam('layout', 'p', 'new-seam', {
          orientation: 'horizontal',
          reference: 'bottom',
          offset: 7.1254,
        }),
      ),
    ).not.toBeNull();
    expect(
      store.getState().project.layouts[0]?.pieces[0]?.pieceSeams.at(-1),
    ).toMatchObject({
      orientation: 'horizontal',
      reference: 'bottom',
      offset: 7.125,
    });

    expect(
      commands.execute(removePieceSeam('layout', 'p', 'new-seam')),
    ).not.toBeNull();
    expect(
      store.getState().project.layouts[0]?.pieces[0]?.pieceSeams.map(
        (seam) => seam.id,
      ),
    ).toEqual(['vertical', 'horizontal']);

    history.undo();
    expect(
      store.getState().project.layouts[0]?.pieces[0]?.pieceSeams.at(-1)?.id,
    ).toBe('new-seam');
    history.stop();
  });

  it('rejects duplicate IDs and unknown seam edits without history', () => {
    const { store, commands } = setup();
    const history = new HistoryManager(store);
    history.start();

    expect(
      commands.execute(addPieceSeam('layout', 'p', 'vertical')),
    ).toBeNull();
    expect(
      commands.execute(
        editPieceSeam('layout', 'p', 'missing', { offset: 4 }),
      ),
    ).toBeNull();
    expect(history.getStatus().size).toBe(1);
    history.stop();
  });
});

describe('Piece seam canvas projection', () => {
  it('projects planning seams from their piece-local references in DESIGN', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const projection = createPieceCanvasProjection(state);
    const piece = projection.pieces.find((item) => item.id === 'p');

    expect(
      piece?.seams.find((seam) => seam.id === 'vertical'),
    ).toEqual({
      id: 'vertical',
      kind: 'planning',
      x1: 45,
      y1: 20,
      x2: 45,
      y2: 40,
    });
    expect(
      piece?.seams.find((seam) => seam.id === 'horizontal'),
    ).toEqual({
      id: 'horizontal',
      kind: 'planning',
      x1: 10,
      y1: 36,
      x2: 50,
      y2: 36,
    });
  });

  it('renders each converted fabrication joint once in DESIGN', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const projection = createPieceCanvasProjection(state);
    const p = projection.pieces.find((item) => item.id === 'p');
    const q = projection.pieces.find((item) => item.id === 'q');

    expect(
      p?.seams.filter((seam) => seam.kind === 'fabrication'),
    ).toEqual([
      {
        id: 'joint',
        kind: 'fabrication',
        x1: 50,
        y1: 20,
        x2: 50,
        y2: 40,
      },
    ]);
    expect(
      q?.seams.filter((seam) => seam.kind === 'fabrication'),
    ).toEqual([]);
  });

  it('keeps planning seams in SLAB but omits converted fabrication joints', () => {
    const state = applicationStateFromLegacyPayload(payload('slab'));
    const projection = createPieceCanvasProjection(state);
    const p = projection.pieces.find((item) => item.id === 'p');

    expect(
      p?.seams.filter((seam) => seam.kind === 'planning'),
    ).toHaveLength(2);
    expect(
      p?.seams.filter((seam) => seam.kind === 'fabrication'),
    ).toEqual([]);
    expect(
      p?.seams.find((seam) => seam.id === 'vertical'),
    ).toMatchObject({
      x1: 105,
      y1: 10,
      x2: 105,
      y2: 30,
    });
  });

  it('honors global seam visibility without mutating seam data', () => {
    const { store, commands } = setup();
    commands.execute(updatePreferences({ showSeams: false }));
    const projection = createPieceCanvasProjection(store.getState());

    expect(projection.pieces.every((piece) => piece.seams.length === 0)).toBe(
      true,
    );
    expect(
      store.getState().project.layouts[0]?.pieces[0]?.pieceSeams,
    ).toHaveLength(2);
  });

  it('projects seams against transient geometry overrides during resize preview', () => {
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
          width: 50,
          height: 20,
          cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 },
        },
        pose: { x: 10, y: 20, rotation: 0 },
      },
    );

    expect(
      projected.seams.find((seam) => seam.id === 'vertical'),
    ).toMatchObject({
      x1: 55,
      x2: 55,
    });
  });
});
