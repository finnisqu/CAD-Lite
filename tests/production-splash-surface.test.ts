import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  addLinkedSplash,
  applicationStateFromLegacyPayload,
  createSelectedSplashParentProjection,
  setActiveLayout,
  setSelection,
  setWorkspace,
} from '../src/main';
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

describe('production Splash Inspector projection', () => {
  it('projects one selected countertop Piece and its occupied edges', () => {
    const { store, commands } = setup();
    commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));

    expect(createSelectedSplashParentProjection(store.getState())).toEqual({
      pieceId: 'piece-1',
      name: 'Island',
      occupiedEdges: [],
      active: false,
    });

    commands.execute(
      addLinkedSplash('layout-kitchen', 'piece-1', 'splash-top', 'top'),
    );
    expect(createSelectedSplashParentProjection(store.getState())).toEqual({
      pieceId: 'piece-1',
      name: 'Island',
      occupiedEdges: ['top'],
      active: false,
    });
  });

  it('does not expose the Splash Inspector for a backsplash child', () => {
    const { store, commands } = setup();
    commands.execute(
      addLinkedSplash('layout-kitchen', 'piece-1', 'splash-top', 'top'),
    );
    commands.execute(setSelection({ kind: 'pieces', ids: ['splash-top'] }));
    expect(createSelectedSplashParentProjection(store.getState())).toBeNull();
  });

  it('does not expose the production Splash Inspector in SLAB or without one selected Piece', () => {
    const { store, commands } = setup();
    commands.execute(setSelection({ kind: 'none' }));
    expect(createSelectedSplashParentProjection(store.getState())).toBeNull();

    commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));
    commands.execute(setWorkspace('slab'));
    expect(createSelectedSplashParentProjection(store.getState())).toBeNull();
  });
});
