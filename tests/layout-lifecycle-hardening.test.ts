import { describe, expect, it } from 'vitest';

import {
  AppStore,
  ApplicationEffects,
  CommandDispatcher,
  addPiece,
  applicationStateFromLegacyPayload,
  deleteLayout,
  setActiveLayout,
  setSelection,
  setWorkspace,
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

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  const commands = new CommandDispatcher(store);
  const effects = new ApplicationEffects(store, {
    autosaveStorage: new MemoryStorage(),
    autosave: { debounceMs: 60_000 },
  });
  effects.start();
  return { store, commands, effects };
}

describe('cross-layout session lifecycle hardening', () => {
  it('switches layouts without adding CAD history and clears layout-local session state', () => {
    const { store, commands, effects } = setup();

    commands.execute(setActiveLayout('layout-kitchen'));
    commands.execute(setWorkspace('design'));
    commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));
    const historyBeforeSwitch = effects.history.getStatus();

    commands.execute(setActiveLayout('layout-bath'));

    expect(store.getState().session.activeLayoutId).toBe('layout-bath');
    expect(store.getState().session.selection).toEqual({
      kind: 'layout',
      id: 'layout-bath',
    });
    expect(store.getState().session.interaction.activeTool).toBeNull();
    expect(store.getState().session.transient).toEqual({});
    expect(effects.history.getStatus()).toEqual(historyBeforeSwitch);
  });

  it('keeps edits isolated to their target layout across layout switches', () => {
    const { store, commands } = setup();

    commands.execute(setActiveLayout('layout-bath'));
    commands.execute(addPiece('layout-bath', 'piece-bath-hardening', { name: 'Bath Hardening' }));
    commands.execute(setActiveLayout('layout-kitchen'));

    const kitchen = store.getState().project.layouts.find(
      (layout) => layout.id === 'layout-kitchen',
    );
    const bath = store.getState().project.layouts.find(
      (layout) => layout.id === 'layout-bath',
    );

    expect(kitchen?.pieces.some((piece) => piece.id === 'piece-bath-hardening')).toBe(false);
    expect(bath?.pieces.some((piece) => piece.id === 'piece-bath-hardening')).toBe(true);
  });

  it('deleting the active layout falls back cleanly and undo restores the deleted layout', () => {
    const { store, commands, effects } = setup();

    commands.execute(setActiveLayout('layout-bath'));
    commands.execute(deleteLayout('layout-bath'));

    expect(store.getState().project.layouts.some((layout) => layout.id === 'layout-bath')).toBe(false);
    expect(store.getState().session.activeLayoutId).toBe('layout-kitchen');
    expect(store.getState().session.selection).toEqual({ kind: 'none' });
    expect(store.getState().session.interaction.activeTool).toBeNull();
    expect(store.getState().session.transient).toEqual({});

    expect(effects.history.undo()).toBe(true);
    expect(store.getState().project.layouts.some((layout) => layout.id === 'layout-bath')).toBe(true);
    expect(store.getState().session.activeLayoutId).toBe('layout-bath');
    expect(store.getState().session.selection).toEqual({
      kind: 'layout',
      id: 'layout-bath',
    });
  });
});
