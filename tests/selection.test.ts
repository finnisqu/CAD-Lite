import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  SelectionController,
  applicationStateFromLegacyPayload,
  setActiveLayout,
  setWorkspace,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(applicationStateFromLegacyPayload(v159ProjectFixture));
  const commands = new CommandDispatcher(store);
  const selection = new SelectionController(store, commands);
  commands.execute(setActiveLayout('layout-kitchen'));
  return { store, commands, selection };
}

describe('selection controller', () => {
  it('keeps only one logical selection kind at a time', () => {
    const { selection } = setup();

    selection.select({ kind: 'note', id: 'note-1' });
    expect(selection.getSelection()).toEqual({ kind: 'note', id: 'note-1' });

    selection.selectPiece('piece-1');
    expect(selection.getSelection()).toEqual({ kind: 'pieces', ids: ['piece-1'] });
  });

  it('toggles additive Piece selection without duplicates', () => {
    const { store, selection } = setup();
    const layout = store.getState().project.layouts[0];
    layout?.pieces.push({ id: 'piece-2' });

    selection.selectPiece('piece-1');
    selection.selectPiece('piece-2', true);
    selection.selectPiece('piece-1', true);

    expect(selection.getSelection()).toEqual({ kind: 'pieces', ids: ['piece-2'] });
  });

  it('supports deterministic Piece range selection in layout order', () => {
    const { store, selection } = setup();
    const layout = store.getState().project.layouts[0];
    layout?.pieces.push({ id: 'piece-2' }, { id: 'piece-3' });

    selection.selectPieceRange('piece-1', 'piece-3');

    expect(selection.getSelection()).toEqual({
      kind: 'pieces',
      ids: ['piece-1', 'piece-2', 'piece-3'],
    });
  });

  it('sanitizes stale entity IDs', () => {
    const { selection } = setup();

    expect(selection.select({ kind: 'dimension', id: 'missing' })).toBe(true);
    expect(selection.getSelection()).toEqual({ kind: 'none' });
  });

  it('preserves Piece selection across workspace switches', () => {
    const { store, commands, selection } = setup();
    selection.selectPiece('piece-1');

    commands.execute(setWorkspace('slab'));

    expect(store.getState().session.selection).toEqual({
      kind: 'pieces',
      ids: ['piece-1'],
    });
  });

  it('clears workspace-local selection across workspace switches', () => {
    const { store, commands, selection } = setup();
    selection.select({ kind: 'note', id: 'note-1' });

    commands.execute(setWorkspace('slab'));

    expect(store.getState().session.selection).toEqual({ kind: 'none' });
  });
});
