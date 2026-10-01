import { describe, expect, it, vi } from 'vitest';

import {
  AppStore,
  ApplicationEffects,
  CommandDispatcher,
  DEFAULT_AUTOSAVE_KEY,
  ProjectLifecycle,
  ToolController,
  applicationStateFromLegacyPayload,
  renameLayout,
  setSelection,
  setWorkspace,
  type AutosaveStorage,
} from '../src/app';
import {
  CAD_LITE_SCHEMA_VERSION,
  deserializeCadLiteFile,
} from '../src/persistence';
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

function setup(beforeReplace?: () => void) {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  const commands = new CommandDispatcher(store);
  const storage = new MemoryStorage();
  const effects = new ApplicationEffects(store, {
    autosaveStorage: storage,
    autosave: { debounceMs: 60_000 },
  });
  effects.start();
  const lifecycle = new ProjectLifecycle(store, effects, {
    appVersion: '1.6.0-test',
    ...(beforeReplace ? { beforeReplace } : {}),
  });

  return { store, commands, storage, effects, lifecycle };
}

describe('project file lifecycle', () => {
  it('exports canonical JSON without transient session state', () => {
    const { commands, lifecycle } = setup();
    commands.execute(
      setSelection({ kind: 'layout', id: 'layout-kitchen' }),
    );

    const json = lifecycle.exportJson();
    const file = deserializeCadLiteFile(json);

    expect(file.schemaVersion).toBe(CAD_LITE_SCHEMA_VERSION);
    expect(file.appVersion).toBe('1.6.0-test');
    expect(json).not.toContain('"selection"');
    expect(json).not.toContain('"interaction"');
    expect(json).not.toContain('"transient"');
  });

  it('imports v1.5.99 JSON atomically and starts a fresh session/history baseline', () => {
    const beforeReplace = vi.fn();
    const { store, commands, storage, effects, lifecycle } = setup(beforeReplace);
    const tools = new ToolController(store, commands);

    commands.execute(setWorkspace('design'));
    commands.execute(
      setSelection({ kind: 'layout', id: 'layout-kitchen' }),
    );
    expect(tools.activateLocked('dimension')).toBe(true);
    commands.execute(renameLayout('layout-kitchen', 'Dirty Kitchen'));
    expect(effects.history.getStatus().size).toBeGreaterThan(1);

    const result = lifecycle.importJson(JSON.stringify(v159ProjectFixture));

    expect(beforeReplace).toHaveBeenCalledTimes(1);
    expect(result.autosaved).toBe(true);
    expect(store.getState().project.meta.name).toBe('Architecture Test');
    expect(store.getState().session.selection).toEqual({ kind: 'none' });
    expect(store.getState().session.interaction.activeTool).toBeNull();
    expect(effects.history.getStatus()).toMatchObject({
      size: 1,
      index: 0,
      canUndo: false,
      canRedo: false,
    });
    expect(storage.writes).toBe(1);
    expect(storage.getItem(DEFAULT_AUTOSAVE_KEY)).not.toContain('Dirty Kitchen');
  });

  it('accepts canonical v1.6 exports through the same import path', () => {
    const { store, commands, lifecycle } = setup();
    commands.execute(renameLayout('layout-kitchen', 'Canonical Kitchen'));
    const exported = lifecycle.exportJson();
    commands.execute(renameLayout('layout-kitchen', 'Changed Again'));

    lifecycle.importJson(exported);

    expect(store.getState().project.layouts[0]?.name).toBe('Canonical Kitchen');
  });

  it('rejects malformed or unrelated imports without mutating live state', () => {
    const beforeReplace = vi.fn();
    const { store, storage, effects, lifecycle } = setup(beforeReplace);
    const stateBefore = store.getState();
    const revisionBefore = store.getRevision();
    const historyBefore = effects.history.getStatus();

    expect(() => lifecycle.importJson('{not valid json')).toThrow();
    expect(() => lifecycle.importJson('{"hello":"world"}')).toThrow(
      'Unrecognized CAD Lite project format.',
    );

    expect(beforeReplace).not.toHaveBeenCalled();
    expect(store.getState()).toBe(stateBefore);
    expect(store.getRevision()).toBe(revisionBefore);
    expect(effects.history.getStatus()).toEqual(historyBefore);
    expect(storage.writes).toBe(0);
  });

  it('rejects unsupported future schemas without replacing the project', () => {
    const beforeReplace = vi.fn();
    const { store, lifecycle } = setup(beforeReplace);
    const stateBefore = store.getState();

    expect(() =>
      lifecycle.importJson(
        JSON.stringify({
          schemaVersion: 999,
          appVersion: 'future',
          project: {},
          editor: {},
        }),
      ),
    ).toThrow('Unsupported CAD Lite schema version: 999');

    expect(beforeReplace).not.toHaveBeenCalled();
    expect(store.getState()).toBe(stateBefore);
  });

  it('starts a blank project while preserving durable editor preferences', () => {
    const { store, storage, effects, lifecycle } = setup();
    const preferencesBefore = store.getState().preferences;

    const result = lifecycle.resetProject();

    expect(result.autosaved).toBe(true);
    expect(store.getState().project.layouts).toEqual([]);
    expect(store.getState().project.materials).toEqual([]);
    expect(store.getState().project.meta.name).toBe('');
    expect(store.getState().session.activeLayoutId).toBeNull();
    expect(store.getState().session.workspace).toBe('design');
    expect(store.getState().session.selection).toEqual({ kind: 'none' });
    expect(store.getState().preferences).toEqual(preferencesBefore);
    expect(effects.history.getStatus().size).toBe(1);
    expect(storage.writes).toBe(1);
  });
});
