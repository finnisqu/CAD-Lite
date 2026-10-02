import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  HistoryManager,
  applicationStateFromLegacyPayload,
  reorderPieceSink,
} from '../src/app';
import { movePieceSinkToIndex } from '../src/domain/pieces';
import { mergePieceRangeSelection } from '../src/browser/production-piece-interaction-parity-surface';

function payload() {
  return {
    sinkSideConvention: 'front-bottom-v1',
    project: { name: 'Parity', date: '2026-10-01', notes: '' },
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
        areas: [{ id: 'area', name: 'Area' }],
        activeAreaId: 'area',
        pieces: [
          {
            id: 'piece-a',
            name: 'A',
            areaId: 'area',
            x: 0,
            y: 0,
            w: 60,
            h: 25,
            sinks: [
              { id: 'sink-a', name: 'A', w: 18, h: 13 },
              { id: 'sink-b', name: 'B', w: 18, h: 13 },
              { id: 'sink-c', name: 'C', w: 18, h: 13 },
            ],
            cutouts: [],
            pieceSeams: [],
          },
          { id: 'piece-b', name: 'B', areaId: 'area', x: 65, y: 0, w: 20, h: 25 },
          { id: 'piece-c', name: 'C', areaId: 'area', x: 90, y: 0, w: 20, h: 25 },
          { id: 'piece-d', name: 'D', areaId: 'area', x: 115, y: 0, w: 20, h: 25 },
        ],
        dims: [],
        notes: [],
        lines: [],
        roomFeatures: [],
        overlays: [],
        plan: null,
      },
    ],
    ui: { workspace: 'layout' },
    active: 0,
  };
}

describe('v1.5.99 Piece-list range selection parity', () => {
  it('adds the anchor-to-target range to the existing selection', () => {
    expect(
      mergePieceRangeSelection(
        ['piece-a', 'piece-b', 'piece-c', 'piece-d'],
        ['piece-a', 'piece-d'],
        1,
        2,
      ),
    ).toEqual(['piece-a', 'piece-d', 'piece-b', 'piece-c']);
  });

  it('supports a backward range without duplicating existing ids', () => {
    expect(
      mergePieceRangeSelection(
        ['piece-a', 'piece-b', 'piece-c', 'piece-d'],
        ['piece-c'],
        3,
        1,
      ),
    ).toEqual(['piece-c', 'piece-b', 'piece-d']);
  });
});

describe('production-significant Sink ordering', () => {
  it('moves a Sink to the requested array index without changing its data', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const piece = state.project.layouts[0]?.pieces[0];
    if (!piece) throw new Error('Missing Piece');
    const original = structuredClone(piece.sinks[0]);

    const moved = movePieceSinkToIndex(piece, 'sink-a', 2);

    expect(moved?.sinks.map((sink) => sink.id)).toEqual([
      'sink-b',
      'sink-c',
      'sink-a',
    ]);
    expect(moved?.sinks[2]).toEqual(original);
    expect(movePieceSinkToIndex(piece, 'missing', 1)).toBeNull();
    expect(movePieceSinkToIndex(piece, 'sink-a', 0)).toBe(piece);
  });

  it('records reorder as one undoable command and treats same-index as a no-op', () => {
    const store = new AppStore(applicationStateFromLegacyPayload(payload()));
    const commands = new CommandDispatcher(store);
    const history = new HistoryManager(store);
    history.start();

    expect(
      commands.execute(reorderPieceSink('layout', 'piece-a', 'sink-a', 2)),
    ).not.toBeNull();
    expect(
      store.getState().project.layouts[0]?.pieces[0]?.sinks.map(
        (sink) => sink.id,
      ),
    ).toEqual(['sink-b', 'sink-c', 'sink-a']);
    expect(history.getStatus()).toMatchObject({
      size: 2,
      undoLabel: 'Reorder sink',
    });

    const historySize = history.getStatus().size;
    expect(
      commands.execute(reorderPieceSink('layout', 'piece-a', 'sink-a', 2)),
    ).toBeNull();
    expect(history.getStatus().size).toBe(historySize);

    history.undo();
    expect(
      store.getState().project.layouts[0]?.pieces[0]?.sinks.map(
        (sink) => sink.id,
      ),
    ).toEqual(['sink-a', 'sink-b', 'sink-c']);
    history.stop();
  });
});
