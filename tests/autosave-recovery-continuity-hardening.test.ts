import { describe, expect, it } from 'vitest';

import {
  AppStore,
  ApplicationEffects,
  CommandDispatcher,
  DEFAULT_AUTOSAVE_KEY,
  ProjectLifecycle,
  StartupRecovery,
  addPiece,
  applicationStateFromLegacyPayload,
  renameLayout,
  setActiveLayout,
  setSelection,
  setWorkspace,
  updatePreferences,
  type AutosaveStorage,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

class MemoryStorage implements AutosaveStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function runtime(storage: MemoryStorage) {
  const store = new AppStore(applicationStateFromLegacyPayload(v159ProjectFixture));
  const commands = new CommandDispatcher(store);
  const effects = new ApplicationEffects(store, {
    autosaveStorage: storage,
    autosave: { debounceMs: 60_000 },
  });
  effects.start();
  const lifecycle = new ProjectLifecycle(store, effects, {
    appVersion: '1.6.0-test',
  });
  const recovery = new StartupRecovery(lifecycle, effects);
  return { store, commands, effects, lifecycle, recovery };
}

describe('autosave recovery continuity hardening', () => {
  it('recovers an autosaved working session into a clean history baseline and continues editing', () => {
    const storage = new MemoryStorage();
    const first = runtime(storage);

    first.commands.execute(setActiveLayout('layout-kitchen'));
    first.commands.execute(setWorkspace('slab'));
    first.commands.execute(updatePreferences({
      showGrid: false,
      showNotes: false,
      dimFormat: 'decimal',
      dimPrecision: 8,
    }));
    first.commands.execute(renameLayout('layout-kitchen', 'Autosaved Kitchen'));
    first.commands.execute(addPiece('layout-kitchen', 'piece-autosaved', {
      name: 'Autosaved Piece',
    }));
    first.commands.execute(setSelection({ kind: 'layout', id: 'layout-kitchen' }));

    expect(first.effects.autosave.getStatus().phase).toBe('pending');
    expect(first.effects.autosave.flush()).toBe(true);
    expect(storage.getItem(DEFAULT_AUTOSAVE_KEY)).not.toBeNull();
    first.effects.stop(false);

    const second = runtime(storage);
    expect(second.recovery.inspect()).toMatchObject({
      status: 'available',
      projectName: 'Architecture Test',
      layoutCount: 2,
    });

    const result = second.recovery.recover();
    expect(result.autosaved).toBe(true);

    let state = second.store.getState();
    expect(state.project.layouts[0]?.name).toBe('Autosaved Kitchen');
    expect(
      state.project.layouts[0]?.pieces.some((piece) => piece.id === 'piece-autosaved'),
    ).toBe(true);
    expect(state.session.activeLayoutId).toBe('layout-kitchen');
    expect(state.session.workspace).toBe('slab');
    expect(state.session.selection).toEqual({ kind: 'none' });
    expect(state.session.interaction.activeTool).toBeNull();
    expect(state.preferences.showGrid).toBe(false);
    expect(state.preferences.showNotes).toBe(false);
    expect(state.preferences.dimFormat).toBe('decimal');
    expect(state.preferences.dimPrecision).toBe(8);
    expect(second.effects.history.getStatus()).toMatchObject({
      size: 1,
      index: 0,
      canUndo: false,
      canRedo: false,
    });
    expect(second.recovery.inspect().status).toBe('current');

    second.commands.execute(setWorkspace('design'));
    second.commands.execute(addPiece('layout-kitchen', 'piece-after-recovery', {
      name: 'After Recovery',
    }));

    state = second.store.getState();
    expect(
      state.project.layouts[0]?.pieces.some(
        (piece) => piece.id === 'piece-after-recovery',
      ),
    ).toBe(true);
    expect(state.session.selection).toEqual({
      kind: 'pieces',
      ids: ['piece-after-recovery'],
    });
    expect(second.effects.history.getStatus()).toMatchObject({
      size: 2,
      index: 1,
      canUndo: true,
      canRedo: false,
    });

    expect(second.effects.history.undo()).toBe(true);
    expect(
      second.store.getState().project.layouts[0]?.pieces.some(
        (piece) => piece.id === 'piece-after-recovery',
      ),
    ).toBe(false);
    expect(second.effects.history.redo()).toBe(true);
    expect(
      second.store.getState().project.layouts[0]?.pieces.some(
        (piece) => piece.id === 'piece-after-recovery',
      ),
    ).toBe(true);
  });
});
