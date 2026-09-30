import { describe, expect, it, vi } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  renameLayout,
  setActiveLayout,
  setSelection,
  setWorkspace,
  updatePreferences,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const state = applicationStateFromLegacyPayload(v159ProjectFixture);
  const store = new AppStore(state);
  const commands = new CommandDispatcher(store);
  return { store, commands };
}

describe('application store', () => {
  it('notifies subscribers once with changed-domain metadata', () => {
    const { store, commands } = setup();
    const listener = vi.fn();
    store.subscribe(listener);

    const event = commands.execute(renameLayout('layout-kitchen', 'Kitchen Revised'));

    expect(event?.changed).toEqual({
      project: true,
      session: false,
      preferences: false,
    });
    expect(event?.history).toBe('record');
    expect(event?.persistence).toBe('save');
    expect(event?.revision).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not emit or advance revision for no-op commands', () => {
    const { store, commands } = setup();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(commands.execute(renameLayout('layout-kitchen', 'Kitchen'))).toBeNull();
    expect(store.getRevision()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('allows subscriptions to be removed', () => {
    const { store, commands } = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    commands.execute(renameLayout('layout-kitchen', 'Kitchen Revised'));
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps layout switching out of history while marking it for persistence', () => {
    const { commands } = setup();
    const event = commands.execute(setActiveLayout('layout-kitchen'));

    expect(event?.history).toBe('skip');
    expect(event?.persistence).toBe('save');
    expect(event?.changed).toEqual({
      project: false,
      session: true,
      preferences: false,
    });
  });

  it('preserves current workspace switching as an undoable action', () => {
    const { commands } = setup();
    const event = commands.execute(setWorkspace('design'));

    expect(event?.history).toBe('record');
    expect(event?.persistence).toBe('save');
    expect(event?.changed.session).toBe(true);
  });

  it('keeps selection transient: no history and no persistence', () => {
    const { commands } = setup();
    const event = commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));

    expect(event?.history).toBe('skip');
    expect(event?.persistence).toBe('skip');
    expect(event?.changed.session).toBe(true);
  });

  it('tracks preference-only changes separately', () => {
    const { commands } = setup();
    const event = commands.execute(updatePreferences({ dimFormat: 'decimal' }));

    expect(event?.changed).toEqual({
      project: false,
      session: false,
      preferences: true,
    });
    expect(event?.history).toBe('skip');
    expect(event?.persistence).toBe('save');
  });
});

describe('command transactions', () => {
  it('commits multiple commands once and aggregates policies', () => {
    const { store, commands } = setup();
    const listener = vi.fn();
    store.subscribe(listener);

    const event = commands.executeTransaction('Prepare kitchen view', [
      renameLayout('layout-kitchen', 'Kitchen Main'),
      setActiveLayout('layout-kitchen'),
      setSelection({ kind: 'pieces', ids: ['piece-1'] }),
    ]);

    expect(event?.kind).toBe('transaction');
    expect(event?.commandTypes).toEqual([
      'layout.rename',
      'session.setActiveLayout',
      'session.setSelection',
    ]);
    expect(event?.history).toBe('record');
    expect(event?.persistence).toBe('save');
    expect(event?.changed.project).toBe(true);
    expect(event?.changed.session).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getRevision()).toBe(1);
  });

  it('skips commands that do not actually change state inside a transaction', () => {
    const { commands } = setup();

    const event = commands.executeTransaction('No-op plus real edit', [
      renameLayout('layout-kitchen', 'Kitchen'),
      updatePreferences({ dimFormat: 'decimal' }),
    ]);

    expect(event?.commandTypes).toEqual(['preferences.update']);
  });
});
