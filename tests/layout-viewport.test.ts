import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  updateLayoutViewport,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(structuredClone(v159ProjectFixture)),
  );
  const commands = new CommandDispatcher(store);
  return { store, commands };
}

describe('layout viewport command', () => {
  it('updates and clamps production canvas scale and grid values', () => {
    const { store, commands } = setup();

    commands.execute(
      updateLayoutViewport('layout-kitchen', {
        scale: 99,
        grid: 0.01,
      }),
    );

    const layout = store.getState().project.layouts[0]!;
    expect(layout.scale).toBe(24);
    expect(layout.grid).toBe(0.25);
  });

  it('clamps Piece design poses when the canvas shrinks', () => {
    const { store, commands } = setup();

    commands.execute(
      updateLayoutViewport('layout-kitchen', {
        width: 80,
        height: 40,
      }),
    );

    const layout = store.getState().project.layouts[0]!;
    const piece = layout.pieces[0]!;
    expect(layout.cw).toBe(80);
    expect(layout.ch).toBe(40);
    expect(piece.x).toBe(0);
    expect(piece.y).toBe(0);
  });

  it('enforces the production minimum canvas dimensions', () => {
    const { store, commands } = setup();

    commands.execute(
      updateLayoutViewport('layout-bath', {
        width: 1,
        height: 2,
      }),
    );

    const layout = store.getState().project.layouts[1]!;
    expect(layout.cw).toBe(12);
    expect(layout.ch).toBe(12);
  });
});
