import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  setActiveLayout,
  setSelection,
  setWorkspace,
} from '../src/app';
import { createProductionPiecePropertiesProjection } from '../src/browser';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  const commands = new CommandDispatcher(store);
  commands.execute(setActiveLayout('layout-kitchen'));
  commands.execute(setWorkspace('design'));
  return { store, commands };
}

describe('production Piece properties projection', () => {
  it('projects one selected DESIGN Piece without inventing missing values', () => {
    const { store, commands } = setup();
    commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));

    const projection = createProductionPiecePropertiesProjection(
      store.getState(),
    );

    expect(projection).toMatchObject({
      layoutId: 'layout-kitchen',
      pieceId: 'piece-1',
      name: 'Island',
      width: 96,
      height: 42,
      color: '#ffffff',
      noFill: false,
      fillOpacity: 1,
    });
    expect(projection?.overhangs).toEqual({
      front: 0,
      back: 0,
      left: 0,
      right: 0,
    });
  });

  it('does not expose the production property editor outside a single DESIGN Piece selection', () => {
    const { store, commands } = setup();

    commands.execute(setSelection({ kind: 'none' }));
    expect(
      createProductionPiecePropertiesProjection(store.getState()),
    ).toBeNull();

    commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));
    commands.execute(setWorkspace('slab'));
    expect(
      createProductionPiecePropertiesProjection(store.getState()),
    ).toBeNull();
  });
});
