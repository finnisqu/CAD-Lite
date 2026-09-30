import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AppStore,
  ApplicationEffects,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  renameLayout,
  setActiveLayout,
  setLayoutQuantity,
  setProjectMeta,
  type AutosaveStorage,
} from '../src/app';
import { createProjectLayoutViewModel } from '../src/browser';
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
  const storage = new MemoryStorage();
  const effects = new ApplicationEffects(store, {
    autosaveStorage: storage,
  });
  effects.start();

  return { store, commands, storage, effects };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Batch 8 project/layout vertical slice', () => {
  it('keeps Project metadata out of Undo while still autosaving it', () => {
    vi.useFakeTimers();
    const { store, commands, storage, effects } = setup();

    commands.execute(
      setProjectMeta({
        name: 'World Stone Test',
        notes: 'Do not rewind me',
      }),
    );

    expect(effects.history.getStatus().size).toBe(1);
    expect(effects.autosave.getStatus().phase).toBe('pending');

    commands.execute(
      renameLayout('layout-kitchen', 'Kitchen Revised'),
    );
    expect(effects.history.getStatus().size).toBe(2);

    effects.history.undo();

    expect(store.getState().project.meta.name).toBe(
      'World Stone Test',
    );
    expect(store.getState().project.meta.notes).toBe(
      'Do not rewind me',
    );
    expect(store.getState().project.layouts[0]?.name).toBe(
      'Kitchen',
    );

    vi.advanceTimersByTime(400);
    expect(storage.writes).toBe(1);
  });

  it('runs Layout rename, quantity, navigation, and Undo through one architecture stack', () => {
    const { store, commands, effects } = setup();

    commands.execute(
      renameLayout('layout-kitchen', 'Kitchen Main'),
    );
    commands.execute(
      setLayoutQuantity('layout-kitchen', 7),
    );
    commands.execute(setActiveLayout('layout-bath'));

    const model = createProjectLayoutViewModel(
      store.getState(),
      effects.history.getStatus(),
      effects.autosave.getStatus(),
    );

    expect(model.layouts).toEqual([
      {
        id: 'layout-kitchen',
        name: 'Kitchen Main',
        quantity: 7,
        active: false,
        selected: false,
      },
      {
        id: 'layout-bath',
        name: 'Bath',
        quantity: 1,
        active: true,
        selected: true,
      },
    ]);
    expect(model.selectedLayout?.id).toBe('layout-bath');
    expect(effects.history.getStatus().size).toBe(3);

    effects.history.undo();

    expect(store.getState().session.activeLayoutId).toBe(
      'layout-bath',
    );
    expect(store.getState().project.layouts[0]?.quantity).toBe(2);
    expect(store.getState().project.layouts[0]?.name).toBe(
      'Kitchen Main',
    );
  });

  it('produces canonical autosave data after the vertical slice edits', () => {
    const { commands, storage, effects } = setup();

    commands.execute(setProjectMeta({ name: 'Saved Project' }));
    commands.execute(
      renameLayout('layout-kitchen', 'Kitchen Saved'),
    );
    commands.execute(
      setLayoutQuantity('layout-kitchen', 3),
    );

    expect(effects.autosave.flush()).toBe(true);

    const raw = Array.from(storage.values.values())[0];
    expect(raw).toBeDefined();

    const parsed = JSON.parse(raw ?? '{}') as {
      schemaVersion?: number;
      project?: {
        meta?: { name?: string };
        layouts?: Array<{ name?: string; quantity?: number }>;
      };
    };

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.project?.meta?.name).toBe('Saved Project');
    expect(parsed.project?.layouts?.[0]).toMatchObject({
      name: 'Kitchen Saved',
      quantity: 3,
    });
  });
});
