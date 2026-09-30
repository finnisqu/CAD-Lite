import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AppStore,
  ApplicationEffects,
  AutosaveManager,
  CommandDispatcher,
  DEFAULT_AUTOSAVE_KEY,
  ViewInvalidationCoordinator,
  applicationStateFromLegacyPayload,
  renameLayout,
  setSelection,
  updatePreferences,
  type AutosaveStorage,
  type ViewInvalidationBatch,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

class MemoryStorage implements AutosaveStorage {
  readonly values = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
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
  return { store, commands };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('autosave manager', () => {
  it('debounces save-marked commits at the v1.5.99 400 ms cadence', () => {
    vi.useFakeTimers();
    const { store, commands } = setup();
    const storage = new MemoryStorage();
    const autosave = new AutosaveManager(store, storage);
    autosave.start();

    commands.execute(renameLayout('layout-kitchen', 'Kitchen A'));
    vi.advanceTimersByTime(300);

    // Transient selection must not postpone a pending durable save.
    commands.execute(
      setSelection({ kind: 'layout', id: 'layout-kitchen' }),
    );

    vi.advanceTimersByTime(99);
    expect(storage.writes).toBe(0);

    vi.advanceTimersByTime(1);
    expect(storage.writes).toBe(1);
    expect(autosave.getStatus()).toMatchObject({
      phase: 'saved',
      lastSavedRevision: 2,
    });
  });

  it('writes canonical project JSON without transient selection', () => {
    const { store, commands } = setup();
    const storage = new MemoryStorage();
    const autosave = new AutosaveManager(store, storage);
    autosave.start();

    commands.execute(
      setSelection({ kind: 'layout', id: 'layout-kitchen' }),
    );
    commands.execute(renameLayout('layout-kitchen', 'Kitchen Saved'));
    autosave.flush();

    const raw = storage.getItem(DEFAULT_AUTOSAVE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe(1);
    expect(raw).not.toContain('"selection"');

    const loaded = autosave.read();
    expect(loaded.status).toBe('loaded');
  });

  it('surfaces storage failures without throwing through the store', () => {
    const { store } = setup();
    const error = new Error('Quota exceeded');
    const failingStorage: AutosaveStorage = {
      getItem: () => null,
      setItem: () => {
        throw error;
      },
      removeItem: () => undefined,
    };
    const onError = vi.fn();
    const autosave = new AutosaveManager(store, failingStorage, {
      onError,
    });

    expect(autosave.flush()).toBe(false);
    expect(autosave.getStatus().phase).toBe('error');
    expect(onError).toHaveBeenCalledWith(error);
  });
});

describe('view invalidation coordinator', () => {
  it('derives narrow invalidations and coalesces synchronous commits', () => {
    const { store, commands } = setup();
    const scheduled: Array<() => void> = [];
    const batches: ViewInvalidationBatch[] = [];
    const invalidation = new ViewInvalidationCoordinator(
      store,
      (callback) => scheduled.push(callback),
    );
    invalidation.subscribe((batch) => batches.push(batch));
    invalidation.start();

    commands.execute(
      setSelection({ kind: 'layout', id: 'layout-kitchen' }),
    );
    commands.execute(updatePreferences({ dimFormat: 'decimal' }));

    expect(scheduled).toHaveLength(1);
    expect(batches).toHaveLength(0);

    scheduled[0]?.();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual({
      fromRevision: 1,
      toRevision: 2,
      targets: [
        'canvas',
        'navigator',
        'inspector',
        'toolbar',
        'hud',
      ],
      labels: ['Change selection', 'Update editor preferences'],
    });
  });

  it('routes transient selection away from persistence while still invalidating UI', () => {
    vi.useFakeTimers();
    const { store, commands } = setup();
    const storage = new MemoryStorage();
    const effects = new ApplicationEffects(store, {
      autosaveStorage: storage,
    });
    const batches: ViewInvalidationBatch[] = [];
    effects.invalidation.subscribe((batch) => batches.push(batch));
    effects.start();

    commands.execute(
      setSelection({ kind: 'layout', id: 'layout-kitchen' }),
    );

    vi.advanceTimersByTime(1000);
    effects.invalidation.flush();

    expect(storage.writes).toBe(0);
    expect(batches.at(-1)?.targets).toEqual([
      'canvas',
      'navigator',
      'inspector',
      'toolbar',
    ]);
  });

  it('autosaves an undo traversal without creating a new history entry', () => {
    vi.useFakeTimers();
    const { store, commands } = setup();
    const storage = new MemoryStorage();
    const effects = new ApplicationEffects(store, {
      autosaveStorage: storage,
    });
    effects.start();

    commands.execute(renameLayout('layout-kitchen', 'Kitchen Revised'));
    vi.advanceTimersByTime(400);
    expect(storage.writes).toBe(1);
    expect(effects.history.getStatus().size).toBe(2);

    effects.history.undo();
    expect(effects.history.getStatus().size).toBe(2);

    vi.advanceTimersByTime(400);
    expect(storage.writes).toBe(2);
  });
});
