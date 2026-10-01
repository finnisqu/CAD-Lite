import { describe, expect, it } from 'vitest';

import {
  AppStore,
  ApplicationEffects,
  DEFAULT_AUTOSAVE_KEY,
  ProjectLifecycle,
  StartupRecovery,
  applicationStateFromLegacyPayload,
  type AutosaveStorage,
} from '../src/app';
import {
  migrateCadLiteFile,
  serializeCadLiteFile,
} from '../src/persistence';
import { v159ProjectFixture } from './fixtures/v159-project';

class MemoryStorage implements AutosaveStorage {
  readonly values = new Map<string, string>();
  writes = 0;
  removals = 0;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removals += 1;
    this.values.delete(key);
  }
}

function setup(storage = new MemoryStorage()) {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  const effects = new ApplicationEffects(store, {
    autosaveStorage: storage,
    autosave: { debounceMs: 60_000 },
  });
  const lifecycle = new ProjectLifecycle(store, effects, {
    appVersion: '1.6.0-test',
  });
  const recovery = new StartupRecovery(lifecycle, effects);
  return { store, storage, effects, lifecycle, recovery };
}

function recoveredFile(name = 'Recovered Project') {
  const file = migrateCadLiteFile(v159ProjectFixture);
  file.appVersion = '1.6.0-test';
  file.project.meta.name = name;
  return file;
}

describe('startup recovery', () => {
  it('reports no recovery when autosave storage is empty', () => {
    const { recovery } = setup();
    expect(recovery.inspect()).toEqual({ status: 'none' });
  });

  it('recognizes an autosave identical to the supplied startup project', () => {
    const { storage, lifecycle, recovery } = setup();
    storage.values.set(DEFAULT_AUTOSAVE_KEY, lifecycle.exportJson(false));

    const state = recovery.inspect();
    expect(state.status).toBe('current');
  });

  it('offers and explicitly recovers a divergent canonical autosave', () => {
    const storage = new MemoryStorage();
    const file = recoveredFile();
    storage.values.set(DEFAULT_AUTOSAVE_KEY, serializeCadLiteFile(file));
    const { store, effects, recovery } = setup(storage);

    expect(recovery.inspect()).toMatchObject({
      status: 'available',
      projectName: 'Recovered Project',
      layoutCount: 2,
    });
    expect(store.getState().project.meta.name).toBe('Architecture Test');

    const result = recovery.recover();

    expect(result.autosaved).toBe(true);
    expect(store.getState().project.meta.name).toBe('Recovered Project');
    expect(store.getState().session.selection).toEqual({ kind: 'none' });
    expect(effects.history.getStatus()).toMatchObject({
      size: 1,
      index: 0,
      canUndo: false,
      canRedo: false,
    });
    expect(recovery.getState().status).toBe('current');
  });

  it('can recover a legacy v1.5.99 autosave through the same startup path', () => {
    const storage = new MemoryStorage();
    storage.values.set(DEFAULT_AUTOSAVE_KEY, JSON.stringify(v159ProjectFixture));
    const { store, recovery } = setup(storage);
    store.getState().project.meta.name = 'Supplied Startup';

    const state = recovery.inspect();
    expect(state.status).toBe('available');

    recovery.recover();
    expect(store.getState().project.meta.name).toBe('Architecture Test');
  });

  it('isolates corrupt autosave data without mutating the supplied project', () => {
    const storage = new MemoryStorage();
    storage.values.set(DEFAULT_AUTOSAVE_KEY, '{broken json');
    const { store, recovery } = setup(storage);
    const stateBefore = store.getState();

    const state = recovery.inspect();

    expect(state.status).toBe('corrupt');
    expect(store.getState()).toBe(stateBefore);
    expect(storage.getItem(DEFAULT_AUTOSAVE_KEY)).toBe('{broken json');
  });

  it('uses the supplied project by replacing stale or corrupt autosave data canonically', () => {
    const storage = new MemoryStorage();
    storage.values.set(DEFAULT_AUTOSAVE_KEY, '{broken json');
    const { storage: activeStorage, recovery } = setup(storage);

    expect(recovery.inspect().status).toBe('corrupt');
    const result = recovery.useCurrentProject();

    expect(result.autosaved).toBe(true);
    expect(activeStorage.removals).toBe(1);
    expect(activeStorage.writes).toBe(1);
    expect(recovery.inspect().status).toBe('current');
  });
});
