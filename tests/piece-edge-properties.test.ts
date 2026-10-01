import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  updatePieceEdgeProperties,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  return { store, commands: new CommandDispatcher(store) };
}

function piece(store: AppStore) {
  return store
    .getState()
    .project.layouts.find((layout) => layout.id === 'layout-kitchen')
    ?.pieces.find((item) => item.id === 'piece-1');
}

describe('Piece edge properties command', () => {
  it('normalizes overhangs, preserves arbitrary profile names, and clamps radii', () => {
    const { store, commands } = setup();

    commands.execute(
      updatePieceEdgeProperties('layout-kitchen', 'piece-1', {
        overhangs: { front: -2, right: 1.625 },
        edgeProfiles: { top: '  Custom Ogee  ', bottom: 'Flat' },
        cornerRadii: { tl: 99, br: 2.25 },
      }),
    );

    const updated = piece(store);
    expect(updated?.overhangs.front).toBe(0);
    expect(updated?.overhangs.right).toBe(1.625);
    expect(updated?.edgeProfiles.top).toBe('Custom Ogee');
    expect(updated?.edgeProfiles.bottom).toBe('Flat');
    expect(updated?.cornerRadii.tl).toBe(21);
    expect(updated?.cornerRadii.br).toBe(2.25);
  });

  it('ignores non-finite values and is a no-op when the normalized result is unchanged', () => {
    const { store, commands } = setup();
    const before = store.getState();
    const current = piece(store);
    expect(current).toBeDefined();

    const result = commands.execute(
      updatePieceEdgeProperties('layout-kitchen', 'piece-1', {
        overhangs: { front: Number.NaN },
        edgeProfiles: { top: current?.edgeProfiles.top ?? '' },
        cornerRadii: { tl: Number.POSITIVE_INFINITY },
      }),
    );

    expect(result).toBeNull();
    expect(store.getState()).toBe(before);
  });
});
