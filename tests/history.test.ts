import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  HistoryManager,
  SelectionController,
  applicationStateFromLegacyPayload,
  renameLayout,
  setActiveLayout,
  setSelection,
  setWorkspace,
  updatePreferences,
  type AppCommand,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  const commands = new CommandDispatcher(store);
  commands.execute(setActiveLayout('layout-kitchen'));
  const selection = new SelectionController(store, commands);
  const history = new HistoryManager(store);
  history.start();

  return { store, commands, selection, history };
}

function addPiece(id: string): AppCommand {
  return {
    type: 'piece.add.test',
    label: 'Add piece',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const layoutIndex = state.project.layouts.findIndex(
        (layout) => layout.id === state.session.activeLayoutId,
      );
      const layout = state.project.layouts[layoutIndex];
      if (layoutIndex < 0 || !layout) return state;

      const layouts = [...state.project.layouts];
      layouts[layoutIndex] = {
        ...layout,
        pieces: [...layout.pieces, { id }],
      };

      return {
        ...state,
        project: {
          ...state.project,
          layouts,
        },
      };
    },
  };
}

describe('history manager', () => {
  it('records undoable commits and restores project state', () => {
    const { store, commands, history } = setup();

    commands.execute(renameLayout('layout-kitchen', 'Kitchen Revised'));

    expect(history.getStatus()).toMatchObject({
      size: 2,
      index: 1,
      canUndo: true,
      canRedo: false,
      undoLabel: 'Rename layout',
    });

    expect(history.undo()).toBe(true);
    expect(store.getState().project.layouts[0]?.name).toBe('Kitchen');
    expect(history.canRedo()).toBe(true);

    expect(history.redo()).toBe(true);
    expect(store.getState().project.layouts[0]?.name).toBe(
      'Kitchen Revised',
    );
  });

  it('does not rewind preferences or active Layout changes marked out of history', () => {
    const { store, commands, history } = setup();

    commands.execute(updatePreferences({ dimFormat: 'decimal' }));
    commands.execute(setActiveLayout('layout-bath'));
    commands.execute(renameLayout('layout-bath', 'Primary Bath'));

    history.undo();

    expect(store.getState().preferences.dimFormat).toBe('decimal');
    expect(store.getState().session.activeLayoutId).toBe('layout-bath');
    expect(store.getState().project.layouts[1]?.name).toBe('Bath');
  });

  it('keeps workspace switching undoable', () => {
    const { store, commands, history } = setup();

    expect(store.getState().session.workspace).toBe('slab');
    commands.execute(setWorkspace('design'));

    history.undo();
    expect(store.getState().session.workspace).toBe('slab');

    history.redo();
    expect(store.getState().session.workspace).toBe('design');
  });

  it('preserves a valid current selection through undo', () => {
    const { store, commands, selection, history } = setup();

    selection.selectPiece('piece-1');
    commands.execute(renameLayout('layout-kitchen', 'Kitchen Revised'));
    history.undo();

    expect(store.getState().session.selection).toEqual({
      kind: 'pieces',
      ids: ['piece-1'],
    });
  });

  it('falls back to the historical selection when the current entity disappears', () => {
    const { store, commands, selection, history } = setup();

    selection.selectPiece('piece-1');
    history.reset();
    commands.execute(addPiece('piece-2'));
    selection.selectPiece('piece-2');

    history.undo();

    expect(store.getState().session.selection).toEqual({
      kind: 'pieces',
      ids: ['piece-1'],
    });
  });

  it('truncates redo after a new undoable edit', () => {
    const { commands, history } = setup();

    commands.execute(renameLayout('layout-kitchen', 'Kitchen A'));
    commands.execute(renameLayout('layout-kitchen', 'Kitchen B'));
    history.undo();

    expect(history.canRedo()).toBe(true);

    commands.execute(renameLayout('layout-kitchen', 'Kitchen C'));

    expect(history.canRedo()).toBe(false);
    expect(history.getStatus().size).toBe(3);
  });

  it('treats one command transaction as one history step', () => {
    const { commands, history } = setup();

    commands.executeTransaction('Kitchen batch edit', [
      renameLayout('layout-kitchen', 'Kitchen Main'),
      setSelection({ kind: 'pieces', ids: ['piece-1'] }),
    ]);

    expect(history.getStatus()).toMatchObject({
      size: 2,
      undoLabel: 'Kitchen batch edit',
    });
  });
});
