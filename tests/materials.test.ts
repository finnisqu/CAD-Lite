import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  addMaterial,
  applicationStateFromLegacyPayload,
  deleteMaterial,
  setSelection,
  updateMaterial,
} from '../src/app';
import {
  createProjectMaterial,
  patchProjectMaterial,
} from '../src/domain/materials';
import { normalizeSelection } from '../src/app/selection';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  return { store, commands: new CommandDispatcher(store) };
}

describe('Batch 27 Stone Materials foundation', () => {
  it('creates the exact v1.5.99 project material defaults', () => {
    expect(
      createProjectMaterial({
        id: 'mat-new',
        index: 2,
        defaultSlabW: 130,
        defaultSlabH: 65,
      }),
    ).toEqual({
      id: 'mat-new',
      name: 'Material 3',
      category: '',
      manufacturer: '',
      finish: 'Polished',
      thicknessCm: 3,
      defaultSlabW: 130,
      defaultSlabH: 65,
    });
  });

  it('normalizes Inspector edits with production limits and required fallbacks', () => {
    const material = createProjectMaterial({ id: 'mat', index: 0 });
    expect(
      patchProjectMaterial(material, {
        name: '   ',
        category: ' Quartz ',
        manufacturer: ' Acme ',
        finish: ' ',
        thicknessCm: 100,
        defaultSlabW: 8,
        defaultSlabH: 900,
      }),
    ).toMatchObject({
      name: 'Material',
      category: 'Quartz',
      manufacturer: 'Acme',
      finish: 'Polished',
      thicknessCm: 10,
      defaultSlabW: 24,
      defaultSlabH: 120,
    });
  });

  it('adds a project material using editor slab defaults and selects it', () => {
    const { store, commands } = setup();
    const beforeCount = store.getState().project.materials.length;

    expect(commands.execute(addMaterial('mat-added'))).not.toBeNull();
    const state = store.getState();
    expect(state.project.materials).toHaveLength(beforeCount + 1);
    expect(state.project.materials.at(-1)).toMatchObject({
      id: 'mat-added',
      name: `Material ${beforeCount + 1}`,
      defaultSlabW: state.preferences.defaultSlabW,
      defaultSlabH: state.preferences.defaultSlabH,
    });
    expect(state.session.selection).toEqual({
      kind: 'material',
      id: 'mat-added',
    });
  });

  it('updates material details through one typed history-recording command', () => {
    const { store, commands } = setup();
    expect(
      commands.execute(
        updateMaterial('mat-quartz', {
          name: 'Quartz B',
          thicknessCm: 2,
          defaultSlabW: 140,
        }),
      ),
    ).not.toBeNull();
    expect(store.getState().project.materials[0]).toMatchObject({
      name: 'Quartz B',
      thicknessCm: 2,
      defaultSlabW: 140,
    });
  });

  it('deletes the selected material and selects the production-style adjacent row', () => {
    const { store, commands } = setup();
    commands.execute(addMaterial('mat-second'));
    commands.execute(setSelection({ kind: 'material', id: 'mat-quartz' }));
    commands.execute(deleteMaterial('mat-quartz'));

    expect(store.getState().project.materials.map((item) => item.id)).toEqual([
      'mat-second',
    ]);
    expect(store.getState().session.selection).toEqual({
      kind: 'material',
      id: 'mat-second',
    });

    commands.execute(deleteMaterial('mat-second'));
    expect(store.getState().session.selection).toEqual({
      kind: 'materialCollection',
    });
  });

  it('keeps the empty Stone Materials collection as a valid session context', () => {
    const { store } = setup();
    expect(
      normalizeSelection(store.getState(), { kind: 'materialCollection' }),
    ).toEqual({ kind: 'materialCollection' });
  });

  it('falls back from a stale material id to the first configured material', () => {
    const { store } = setup();
    expect(
      normalizeSelection(store.getState(), {
        kind: 'material',
        id: 'missing',
      }),
    ).toEqual({ kind: 'material', id: 'mat-quartz' });
  });
});
