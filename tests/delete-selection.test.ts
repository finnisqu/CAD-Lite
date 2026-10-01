import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  addDrawingLine,
  applicationStateFromLegacyPayload,
  deleteCanvasSelection,
  setActiveLayout,
  setSelection,
  setWorkspace,
} from '../src/app';
import { createDrawingLine } from '../src/domain/annotations';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(structuredClone(v159ProjectFixture)),
  );
  const commands = new CommandDispatcher(store);
  commands.execute(setActiveLayout('layout-kitchen'));
  commands.execute(setWorkspace('design'));
  return { store, commands };
}

describe('shared canvas selection deletion', () => {
  it('deletes selected Pieces', () => {
    const { store, commands } = setup();
    commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));

    expect(deleteCanvasSelection(store, commands)).toBe(true);
    expect(store.getState().project.layouts[0]!.pieces).toHaveLength(0);
    expect(store.getState().session.selection).toEqual({ kind: 'none' });
  });

  it('deletes selected Dimensions, Lines, and Notes through typed annotation commands', () => {
    const dimension = setup();
    dimension.commands.execute(
      setSelection({ kind: 'dimension', id: 'dim-1' }),
    );
    expect(deleteCanvasSelection(dimension.store, dimension.commands)).toBe(true);
    expect(dimension.store.getState().project.layouts[0]!.dims).toHaveLength(0);

    const line = setup();
    line.commands.execute(
      addDrawingLine(
        'layout-kitchen',
        createDrawingLine('line-delete', { x: 10, y: 10 }, { x: 20, y: 20 }),
      ),
    );
    line.commands.execute(setSelection({ kind: 'line', id: 'line-delete' }));
    expect(deleteCanvasSelection(line.store, line.commands)).toBe(true);
    expect(line.store.getState().project.layouts[0]!.lines).toHaveLength(0);

    const note = setup();
    note.commands.execute(setSelection({ kind: 'note', id: 'note-1' }));
    expect(deleteCanvasSelection(note.store, note.commands)).toBe(true);
    expect(note.store.getState().project.layouts[0]!.notes).toHaveLength(0);
  });

  it('deletes selected Room Features and Slabs', () => {
    const room = setup();
    room.commands.execute(
      setSelection({ kind: 'roomFeature', id: 'room-1' }),
    );
    expect(deleteCanvasSelection(room.store, room.commands)).toBe(true);
    expect(room.store.getState().project.layouts[0]!.roomFeatures).toHaveLength(0);

    const slab = setup();
    slab.commands.execute(setWorkspace('slab'));
    slab.commands.execute(setSelection({ kind: 'slab', id: 'slab-1' }));
    expect(deleteCanvasSelection(slab.store, slab.commands)).toBe(true);
    expect(slab.store.getState().project.layouts[0]!.overlays).toHaveLength(0);
  });

  it('returns false when there is no deletable selection', () => {
    const { store, commands } = setup();
    commands.execute(setSelection({ kind: 'none' }));

    expect(deleteCanvasSelection(store, commands)).toBe(false);
  });
});
