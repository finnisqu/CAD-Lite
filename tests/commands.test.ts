import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  renameArea,
  renameLayout,
  renameMaterial,
  setLayoutQuantity,
  setProjectMeta,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(applicationStateFromLegacyPayload(v159ProjectFixture));
  return {
    store,
    commands: new CommandDispatcher(store),
  };
}

describe('foundation commands', () => {
  it('updates project metadata with structural sharing', () => {
    const { store, commands } = setup();
    const before = store.getState();

    commands.execute(setProjectMeta({ notes: 'Revised notes' }));
    const after = store.getState();

    expect(after.project.meta.notes).toBe('Revised notes');
    expect(after.project).not.toBe(before.project);
    expect(after.project.layouts).toBe(before.project.layouts);
    expect(after.session).toBe(before.session);
    expect(after.preferences).toBe(before.preferences);
  });

  it('renames a layout without cloning unrelated layouts', () => {
    const { store, commands } = setup();
    const before = store.getState();
    const untouched = before.project.layouts[1];

    commands.execute(renameLayout('layout-kitchen', 'Kitchen Main'));
    const after = store.getState();

    expect(after.project.layouts[0]?.name).toBe('Kitchen Main');
    expect(after.project.layouts[1]).toBe(untouched);
  });

  it('matches v1.5.99 layout quantity normalization', () => {
    const { store, commands } = setup();

    commands.execute(setLayoutQuantity('layout-kitchen', 99_999));
    expect(store.getState().project.layouts[0]?.quantity).toBe(9999);

    commands.execute(setLayoutQuantity('layout-kitchen', -20));
    expect(store.getState().project.layouts[0]?.quantity).toBe(1);
  });

  it('allows the same empty rename value the existing inline rename accepts', () => {
    const { store, commands } = setup();

    commands.execute(renameArea('layout-kitchen', 'area-island', '   '));
    expect(store.getState().project.layouts[0]?.areas[1]?.name).toBe('');
  });

  it('renames materials through the same project command path', () => {
    const { store, commands } = setup();

    commands.execute(renameMaterial('mat-quartz', 'Quartz B'));
    expect(store.getState().project.materials[0]?.name).toBe('Quartz B');
  });
});
