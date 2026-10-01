import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  addLinkedSplash,
  applicationStateFromLegacyPayload,
  resizePieceDimension,
  setActiveLayout,
  setWorkspace,
  transformPieces,
} from '../src/app';
import {
  linkedSplashForEdge,
  linkedSplashPlacement,
} from '../src/domain/pieces';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  const commands = new CommandDispatcher(store);
  commands.execute(setActiveLayout('layout-kitchen'));
  commands.execute(setWorkspace('design'));
  commands.execute(
    addLinkedSplash('layout-kitchen', 'piece-1', 'splash-top', 'top'),
  );
  return { store, commands };
}

function family(store: AppStore) {
  const layout = store.getState().project.layouts
    .find((item) => item.id === 'layout-kitchen');
  const parent = layout?.pieces.find((piece) => piece.id === 'piece-1');
  const splash = layout
    ? linkedSplashForEdge(layout.pieces, 'piece-1', 'top')
    : null;
  return { layout, parent, splash };
}

describe('linked splash synchronization at the Piece command boundary', () => {
  it('updates linked length and snapped placement after parent resize', () => {
    const { store, commands } = setup();
    commands.execute(
      resizePieceDimension('layout-kitchen', 'piece-1', 'width', 108),
    );

    const { parent, splash } = family(store);
    expect(parent).toBeTruthy();
    expect(splash).toBeTruthy();
    if (!parent || !splash) return;
    const expected = linkedSplashPlacement(
      parent,
      'top',
      splash.h,
      splash.attachment?.offset,
    );
    expect(splash.w).toBe(parent.w);
    expect(splash).toMatchObject({
      x: expected.x,
      y: expected.y,
      rotation: expected.rotation,
    });
  });

  it('moves a snapped linked Splash when its parent moves', () => {
    const { store, commands } = setup();
    const before = family(store).parent;
    if (!before) return;

    commands.execute(
      transformPieces('layout-kitchen', [
        {
          id: 'piece-1',
          designPose: {
            x: before.x + 8,
            y: before.y + 6,
            rotation: before.rotation,
          },
        },
      ]),
    );

    const { parent, splash } = family(store);
    expect(parent).toBeTruthy();
    expect(splash).toBeTruthy();
    if (!parent || !splash) return;
    const expected = linkedSplashPlacement(
      parent,
      'top',
      splash.h,
      splash.attachment?.offset,
    );
    expect(splash.attachment?.snapped).toBe(true);
    expect(splash).toMatchObject({
      x: expected.x,
      y: expected.y,
      rotation: expected.rotation,
    });
  });

  it('preserves an independently moved Splash as unsnapped', () => {
    const { store, commands } = setup();
    const initial = family(store).splash;
    if (!initial) return;

    commands.execute(
      transformPieces('layout-kitchen', [
        {
          id: initial.id,
          designPose: {
            x: initial.x + 10,
            y: initial.y + 10,
            rotation: initial.rotation,
          },
        },
      ]),
    );
    const detached = family(store).splash;
    expect(detached?.attachment?.snapped).toBe(false);
    const detachedPose = detached
      ? { x: detached.x, y: detached.y, rotation: detached.rotation }
      : null;

    const parent = family(store).parent;
    if (!parent || !detachedPose) return;
    commands.execute(
      transformPieces('layout-kitchen', [
        {
          id: parent.id,
          designPose: {
            x: parent.x + 5,
            y: parent.y,
            rotation: parent.rotation,
          },
        },
      ]),
    );

    const after = family(store).splash;
    expect(after?.attachment?.snapped).toBe(false);
    expect(after).toMatchObject(detachedPose);
  });
});
