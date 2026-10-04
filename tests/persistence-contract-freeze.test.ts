import { describe, expect, it } from 'vitest';

import {
  AppStore,
  ApplicationEffects,
  ApplicationStatePreview,
  ProjectLifecycle,
  applicationStateFromLegacyPayload,
  cadLiteFileFromApplicationState,
  type ApplicationState,
  type AutosaveStorage,
} from '../src/app';
import {
  deserializeCadLiteFile,
  migrateCadLiteFile,
  serializeCadLiteFile,
} from '../src/persistence';
import {
  v159GoldenProjectFixture,
  v159GoldenSnapshotFixture,
} from './fixtures/v159-golden-project';

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

const APP_VERSION = '1.6.0-contract-freeze';
const AUTOSAVE_KEY = 'batch79:autosave';

function stateWithTransientNoise(): ApplicationState {
  const state = applicationStateFromLegacyPayload(
    structuredClone(v159GoldenProjectFixture),
  );

  state.session.selection = { kind: 'pieces', ids: ['piece-1'] };
  state.session.transient = {
    pointerPreview: true,
    hoverEntityId: 'piece-1',
  };

  return state;
}

function runtime(initial = stateWithTransientNoise()) {
  const storage = new MemoryStorage();
  const store = new AppStore(initial);
  const effects = new ApplicationEffects(store, {
    autosaveStorage: storage,
    autosave: {
      key: AUTOSAVE_KEY,
      debounceMs: 60_000,
      appVersion: APP_VERSION,
    },
  });
  effects.start();
  const lifecycle = new ProjectLifecycle(store, effects, {
    appVersion: APP_VERSION,
  });

  return { storage, store, effects, lifecycle };
}

describe('Batch 79 persistence and compatibility contract freeze', () => {
  it('persists only project data plus the intentionally durable editor contract', () => {
    const state = stateWithTransientNoise();
    const file = cadLiteFileFromApplicationState(state, APP_VERSION);

    expect(Object.keys(file).sort()).toEqual([
      'appVersion',
      'editor',
      'project',
      'schemaVersion',
    ]);
    expect(Object.keys(file.editor).sort()).toEqual([
      'activeLayoutId',
      'preferences',
      'workspace',
    ]);
    expect(file.project).toEqual(state.project);
    expect(file.editor.activeLayoutId).toBe(state.session.activeLayoutId);
    expect(file.editor.workspace).toBe(state.session.workspace);
    expect(file.editor.preferences).toEqual(state.preferences);
    expect(file.editor).not.toHaveProperty('selection');
    expect(file.editor).not.toHaveProperty('interaction');
    expect(file.editor).not.toHaveProperty('transient');
  });

  it('keeps both supported v1.5.99 payload families byte-stable after canonicalization', () => {
    for (const payload of [
      v159GoldenProjectFixture,
      v159GoldenSnapshotFixture,
    ]) {
      const first = serializeCadLiteFile(migrateCadLiteFile(payload));
      const second = serializeCadLiteFile(deserializeCadLiteFile(first));

      expect(second).toBe(first);
    }
  });

  it('uses the same canonical contract for autosave and explicit project export', () => {
    const { storage, effects, lifecycle } = runtime();

    try {
      expect(effects.autosave.flush()).toBe(true);
      const autosaved = storage.getItem(AUTOSAVE_KEY);
      expect(autosaved).not.toBeNull();
      if (!autosaved) throw new Error('Expected autosave payload.');

      expect(deserializeCadLiteFile(autosaved)).toEqual(lifecycle.exportFile());
      expect(autosaved).not.toContain('pointerPreview');
      expect(autosaved).not.toContain('hoverEntityId');
      expect(autosaved).not.toContain('selectedIds');
    } finally {
      effects.stop(false);
    }
  });

  it('keeps output preview swaps outside persistence and history, including failure cleanup', async () => {
    const { storage, store, effects, lifecycle } = runtime();

    try {
      expect(effects.autosave.flush()).toBe(true);
      const savedBefore = storage.getItem(AUTOSAVE_KEY);
      const exportBefore = lifecycle.exportJson(false);
      const historyBefore = effects.history.getStatus();
      const autosaveBefore = effects.autosave.getStatus();
      const baseline = store.getState();
      const alternateLayoutId = baseline.project.layouts.find(
        (layout) => layout.id !== baseline.session.activeLayoutId,
      )?.id;
      if (!alternateLayoutId) throw new Error('Golden fixture requires two layouts.');

      const preview = new ApplicationStatePreview(store);
      await expect(
        preview.run(({ replace }) => {
          replace({
            project: baseline.project,
            preferences: baseline.preferences,
            session: {
              ...baseline.session,
              activeLayoutId: alternateLayoutId,
              selection: { kind: 'none' },
              transient: { outputPreview: true },
            },
          });
          return Promise.reject(new Error('synthetic output failure'));
        }),
      ).rejects.toThrow('synthetic output failure');

      expect(lifecycle.exportJson(false)).toBe(exportBefore);
      expect(storage.getItem(AUTOSAVE_KEY)).toBe(savedBefore);
      expect(effects.history.getStatus()).toEqual(historyBefore);
      expect(effects.autosave.getStatus()).toEqual(autosaveBefore);
      expect(store.getState().project).toBe(baseline.project);
      expect(store.getState().preferences).toBe(baseline.preferences);
      expect(store.getState().session).toBe(baseline.session);
    } finally {
      effects.stop(false);
    }
  });
});
