import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  setActiveLayout,
  setSelection,
  setWorkspace,
} from '../src/app';
import { createSlabNavigatorProjection } from '../src/browser';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(structuredClone(v159ProjectFixture)),
  );
  const commands = new CommandDispatcher(store);
  commands.execute(setActiveLayout('layout-kitchen'));
  return { store, commands };
}

describe('slab navigator projection', () => {
  it('stays out of the DESIGN navigator', () => {
    const { store, commands } = setup();
    commands.execute(setWorkspace('design'));

    expect(createSlabNavigatorProjection(store.getState())).toEqual({
      visible: false,
      count: 0,
      items: [],
    });
  });

  it('projects SLAB surfaces and selected state', () => {
    const { store, commands } = setup();
    commands.execute(setWorkspace('slab'));
    commands.execute(setSelection({ kind: 'slab', id: 'slab-1' }));

    const projection = createSlabNavigatorProjection(store.getState());
    expect(projection.visible).toBe(true);
    expect(projection.count).toBe(1);
    expect(projection.items).toEqual([
      expect.objectContaining({
        id: 'slab-1',
        selected: true,
        visible: true,
      }),
    ]);
    expect(projection.items[0]?.dimensions).toContain('×');
  });
});
