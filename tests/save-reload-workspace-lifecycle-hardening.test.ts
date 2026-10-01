import { describe, expect, it } from 'vitest';

import {
  AppStore,
  ApplicationEffects,
  CommandDispatcher,
  ProjectLifecycle,
  addPiece,
  applicationStateFromLegacyPayload,
  renameLayout,
  setActiveLayout,
  setSelection,
  setWorkspace,
  updatePreferences,
  type AutosaveStorage,
} from '../src/app';
import type { JsonObject } from '../src/domain/types';
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

function setup(payload: unknown = v159ProjectFixture) {
  const store = new AppStore(applicationStateFromLegacyPayload(payload));
  const commands = new CommandDispatcher(store);
  const effects = new ApplicationEffects(store, {
    autosaveStorage: new MemoryStorage(),
    autosave: { debounceMs: 60_000 },
  });
  effects.start();
  const lifecycle = new ProjectLifecycle(store, effects, {
    appVersion: '1.6.0-test',
  });
  return { store, commands, effects, lifecycle };
}

function viewRecord(
  workspaceViews: JsonObject | null,
  key: 'layout' | 'slab',
): JsonObject {
  const value = workspaceViews?.[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Missing ${key} workspace view`);
  }
  return value;
}

describe('save/reload workspace lifecycle hardening', () => {
  it('preserves durable workspace state while resetting transient session/history state', () => {
    const { store, commands, effects, lifecycle } = setup();

    commands.execute(setActiveLayout('layout-kitchen'));
    commands.execute(setWorkspace('design'));
    commands.execute(updatePreferences({
      showGrid: false,
      showNotes: false,
      dimFormat: 'decimal',
      dimPrecision: 8,
    }));
    commands.execute(setWorkspace('slab'));
    commands.execute(updatePreferences({ showGrid: true, showNotes: true }));
    commands.execute(setSelection({ kind: 'layout', id: 'layout-kitchen' }));
    commands.execute(renameLayout('layout-kitchen', 'Saved Kitchen'));

    const saved = lifecycle.exportJson();
    expect(effects.history.getStatus().canUndo).toBe(true);

    commands.execute(setWorkspace('design'));
    commands.execute(updatePreferences({ showGrid: true, showNotes: true }));
    commands.execute(renameLayout('layout-kitchen', 'Unsaved Kitchen'));

    lifecycle.importJson(saved);

    let state = store.getState();
    expect(state.project.layouts[0]?.name).toBe('Saved Kitchen');
    expect(state.session.activeLayoutId).toBe('layout-kitchen');
    expect(state.session.workspace).toBe('slab');
    expect(state.session.selection).toEqual({ kind: 'none' });
    expect(state.session.interaction.activeTool).toBeNull();
    expect(effects.history.getStatus()).toMatchObject({
      size: 1,
      index: 0,
      canUndo: false,
      canRedo: false,
    });

    expect(state.preferences.dimFormat).toBe('decimal');
    expect(state.preferences.dimPrecision).toBe(8);
    expect(state.preferences.showGrid).toBe(true);
    expect(state.preferences.showNotes).toBe(true);
    expect(viewRecord(state.preferences.workspaceViews, 'slab').showGrid).toBe(true);
    expect(viewRecord(state.preferences.workspaceViews, 'slab').showNotes).toBe(true);
    expect(viewRecord(state.preferences.workspaceViews, 'layout').showGrid).toBe(false);
    expect(viewRecord(state.preferences.workspaceViews, 'layout').showNotes).toBe(false);

    commands.execute(setWorkspace('design'));
    state = store.getState();
    expect(state.preferences.showGrid).toBe(false);
    expect(state.preferences.showNotes).toBe(false);
    expect(state.preferences.dimFormat).toBe('decimal');
    expect(state.preferences.dimPrecision).toBe(8);
  });

  it('continues normal editing and history after a saved project is reloaded', () => {
    const { store, commands, effects, lifecycle } = setup();

    commands.execute(setActiveLayout('layout-kitchen'));
    commands.execute(setWorkspace('design'));
    commands.execute(renameLayout('layout-kitchen', 'Reload Baseline'));
    const saved = lifecycle.exportJson();

    lifecycle.importJson(saved);
    commands.execute(addPiece('layout-kitchen', 'piece-after-reload', {
      name: 'After Reload',
    }));

    expect(
      store.getState().project.layouts[0]?.pieces.some(
        (piece) => piece.id === 'piece-after-reload',
      ),
    ).toBe(true);
    expect(store.getState().session.selection).toEqual({
      kind: 'pieces',
      ids: ['piece-after-reload'],
    });
    expect(effects.history.getStatus()).toMatchObject({
      size: 2,
      index: 1,
      canUndo: true,
      canRedo: false,
    });

    expect(effects.history.undo()).toBe(true);
    expect(
      store.getState().project.layouts[0]?.pieces.some(
        (piece) => piece.id === 'piece-after-reload',
      ),
    ).toBe(false);
    expect(effects.history.redo()).toBe(true);
    expect(
      store.getState().project.layouts[0]?.pieces.some(
        (piece) => piece.id === 'piece-after-reload',
      ),
    ).toBe(true);
  });
});
