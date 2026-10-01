import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  SelectionController,
  applicationStateFromLegacyPayload,
  deleteArea,
  deleteDimension,
  deletePieces,
  deleteRoomFeature,
  setActiveLayout,
  setSelection,
  setWorkspace,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(structuredClone(v159ProjectFixture)),
  );
  const commands = new CommandDispatcher(store);
  const selection = new SelectionController(store, commands);
  commands.execute(setActiveLayout('layout-kitchen'));
  commands.execute(setWorkspace('design'));
  return { store, commands, selection };
}

describe('deletion and stale-selection hardening', () => {
  it('clears a selected Piece when its family is deleted', () => {
    const { store, commands } = setup();
    commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));

    commands.execute(deletePieces('layout-kitchen', ['piece-1']));

    expect(store.getState().project.layouts[0]!.pieces).toHaveLength(0);
    expect(store.getState().session.selection).toEqual({ kind: 'none' });
  });

  it('clears a selected annotation when that annotation is deleted', () => {
    const { store, commands } = setup();
    commands.execute(setSelection({ kind: 'dimension', id: 'dim-1' }));

    commands.execute(deleteDimension('layout-kitchen', 'dim-1'));

    expect(store.getState().project.layouts[0]!.dims).toHaveLength(0);
    expect(store.getState().session.selection).toEqual({ kind: 'none' });
  });

  it('clears a selected Room Feature when that feature is deleted', () => {
    const { store, commands } = setup();
    const feature = store.getState().project.layouts[0]!.roomFeatures[0];
    expect(feature).toBeDefined();
    commands.execute(setSelection({ kind: 'roomFeature', id: feature!.id }));

    commands.execute(deleteRoomFeature('layout-kitchen', feature!.id));

    expect(store.getState().project.layouts[0]!.roomFeatures.some((item) => item.id === feature!.id)).toBe(false);
    expect(store.getState().session.selection).toEqual({ kind: 'none' });
  });

  it('moves a selected deleted Area to its valid fallback Area', () => {
    const { store, commands } = setup();
    const layout = store.getState().project.layouts[0]!;
    expect(layout.areas.length).toBeGreaterThan(1);
    const deletedArea = layout.areas[0]!;
    const fallbackArea = layout.areas[1]!;
    commands.execute(setSelection({ kind: 'area', id: deletedArea.id }));

    commands.execute(deleteArea(layout.id, deletedArea.id, fallbackArea.id));

    expect(store.getState().session.selection).toEqual({
      kind: 'area',
      id: fallbackArea.id,
    });
  });

  it('sanitizes stale Piece IDs while preserving surviving members', () => {
    const { store, commands, selection } = setup();
    const layout = store.getState().project.layouts[0]!;
    layout.pieces.push({ ...structuredClone(layout.pieces[0]!), id: 'piece-survivor' });
    commands.execute(setSelection({
      kind: 'pieces',
      ids: ['piece-1', 'piece-survivor'],
    }));

    layout.pieces.splice(layout.pieces.findIndex((piece) => piece.id === 'piece-1'), 1);
    expect(selection.sanitize()).toBe(true);

    expect(store.getState().session.selection).toEqual({
      kind: 'pieces',
      ids: ['piece-survivor'],
    });
  });

  it('rejects stale single-entity selection references', () => {
    const { store, commands, selection } = setup();
    commands.execute(setSelection({ kind: 'note', id: 'note-1' }));
    const layout = store.getState().project.layouts[0]!;
    layout.notes.splice(layout.notes.findIndex((note) => note.id === 'note-1'), 1);

    expect(selection.sanitize()).toBe(true);
    expect(store.getState().session.selection).toEqual({ kind: 'none' });
  });
});
