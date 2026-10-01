import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  setWorkspace,
  updatePreferences,
} from '../src/app';
import type { JsonObject } from '../src/domain/types';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup(payload: unknown = v159ProjectFixture) {
  const store = new AppStore(applicationStateFromLegacyPayload(payload));
  return { store, commands: new CommandDispatcher(store) };
}

function viewRecord(
  workspaceViews: JsonObject | null,
  key: 'layout' | 'slab',
): JsonObject {
  const value = workspaceViews?.[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Missing ${key} workspace view`);
  }
  return value as JsonObject;
}

describe('workspace-specific View parity', () => {
  it('loads the saved active workspace visibility after ordinary legacy preferences', () => {
    const legacy = structuredClone(v159ProjectFixture);
    const ui = legacy.ui;
    if (!ui || typeof ui !== 'object' || Array.isArray(ui)) {
      throw new Error('Fixture UI changed');
    }

    const record = ui as JsonObject;
    record.workspace = 'slab';
    record.showNotes = false;
    record.showGrid = false;
    record.workspaceViews = {
      layout: { showNotes: false, showGrid: false },
      slab: { showNotes: true, showGrid: true },
    };

    const state = applicationStateFromLegacyPayload(legacy);
    expect(state.session.workspace).toBe('slab');
    expect(state.preferences.showNotes).toBe(true);
    expect(state.preferences.showGrid).toBe(true);
  });

  it('stores visibility changes only in the active workspace and restores them on switch', () => {
    const { store, commands } = setup();

    expect(store.getState().session.workspace).toBe('slab');
    commands.execute(updatePreferences({ showNotes: false, showSeams: false }));

    let state = store.getState();
    expect(state.preferences.showNotes).toBe(false);
    expect(state.preferences.showSeams).toBe(false);
    expect(viewRecord(state.preferences.workspaceViews, 'slab').showNotes).toBe(false);
    expect(viewRecord(state.preferences.workspaceViews, 'layout').showNotes).toBe(true);

    commands.execute(setWorkspace('design'));
    state = store.getState();
    expect(state.preferences.showNotes).toBe(true);
    expect(state.preferences.showSeams).toBe(true);

    commands.execute(updatePreferences({ showGrid: false }));
    expect(store.getState().preferences.showGrid).toBe(false);

    commands.execute(setWorkspace('slab'));
    state = store.getState();
    expect(state.preferences.showNotes).toBe(false);
    expect(state.preferences.showSeams).toBe(false);
    expect(state.preferences.showGrid).toBe(true);

    commands.execute(setWorkspace('design'));
    expect(store.getState().preferences.showGrid).toBe(false);
  });

  it('keeps non-workspace View preferences shared across DESIGN and SLAB', () => {
    const { store, commands } = setup();

    commands.execute(
      updatePreferences({
        dimFormat: 'decimal',
        dimPrecision: 8,
        showRoomFeatures: false,
        pieceFillOpacity: 0.4,
      }),
    );
    commands.execute(setWorkspace('design'));

    const state = store.getState();
    expect(state.preferences.dimFormat).toBe('decimal');
    expect(state.preferences.dimPrecision).toBe(8);
    expect(state.preferences.showRoomFeatures).toBe(false);
    expect(state.preferences.pieceFillOpacity).toBe(0.4);
  });

  it('seeds both workspace buckets from the pre-toggle state when memory is absent', () => {
    const state = applicationStateFromLegacyPayload(v159ProjectFixture);
    state.preferences.workspaceViews = null;
    const store = new AppStore(state);
    const commands = new CommandDispatcher(store);

    expect(store.getState().preferences.showLabels).toBe(true);
    commands.execute(updatePreferences({ showLabels: false }));

    const preferences = store.getState().preferences;
    expect(preferences.showLabels).toBe(false);
    expect(viewRecord(preferences.workspaceViews, 'slab').showLabels).toBe(false);
    expect(viewRecord(preferences.workspaceViews, 'layout').showLabels).toBe(true);
  });
});
