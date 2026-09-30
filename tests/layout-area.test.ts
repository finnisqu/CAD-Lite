import { normalizePieces } from '../src/persistence/pieces';
import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  addArea,
  addLayout,
  applicationStateFromLegacyPayload,
  assignPiecesToArea,
  createEmptyLayout,
  deleteArea,
  deleteLayout,
  duplicateLayout,
  getAreaDeletionPlan,
  renameArea,
  reorderAreas,
  reorderLayouts,
  setActiveArea,
  setActiveLayout,
  type Piece,
} from '../src/main';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  const commands = new CommandDispatcher(store);
  return { store, commands };
}

function kitchenPieces(): Piece[] {
  return normalizePieces([
    {
      id: 'piece-a',
      name: 'A',
      areaId: 'area-kitchen',
      pieceGroupId: 'group-1',
    },
    {
      id: 'piece-b',
      name: 'B',
      areaId: 'area-kitchen',
      pieceGroupId: 'group-1',
    },
    {
      id: 'splash-a',
      name: 'Splash',
      areaId: 'area-kitchen',
      pieceType: 'backsplash',
      attachment: {
        kind: 'backsplash',
        parentPieceId: 'piece-a',
      },
    },
    {
      id: 'piece-c',
      name: 'C',
      areaId: 'area-island',
    },
  ], ['area-kitchen', 'area-island'], 'test-piece');
}

describe('Layout commands', () => {
  it('adds a clean default Layout and activates/selects it', () => {
    const { store, commands } = setup();
    const layout = createEmptyLayout({
      id: 'layout-new',
      firstAreaId: 'area-new',
      name: 'Laundry',
    });

    const event = commands.execute(addLayout(layout));

    expect(event?.history).toBe('record');
    expect(event?.persistence).toBe('save');
    expect(store.getState().project.layouts.at(-1)).toEqual(layout);
    expect(store.getState().session.activeLayoutId).toBe(
      'layout-new',
    );
    expect(store.getState().session.selection).toEqual({
      kind: 'layout',
      id: 'layout-new',
    });
  });

  it('duplicates immediately after the source while preserving current navigation by default', () => {
    const { store, commands } = setup();
    const beforeActive = store.getState().session.activeLayoutId;

    commands.execute(
      duplicateLayout('layout-kitchen', {
        id: 'layout-kitchen-copy',
      }),
    );

    const layouts = store.getState().project.layouts;
    expect(layouts.map((layout) => layout.id)).toEqual([
      'layout-kitchen',
      'layout-kitchen-copy',
      'layout-bath',
    ]);
    expect(layouts[1]?.name).toBe('Kitchen Copy');
    expect(layouts[1]?.pieces[0]?.id).toBe('piece-1');
    expect(store.getState().session.activeLayoutId).toBe(
      beforeActive,
    );
  });

  it('deletes an active Layout, chooses the nearest fallback, and keeps at least one Layout', () => {
    const { store, commands } = setup();

    commands.execute(
      addLayout(
        createEmptyLayout({
          id: 'layout-third',
          firstAreaId: 'area-third',
          name: 'Third',
        }),
      ),
    );
    commands.execute(deleteLayout('layout-third'));

    expect(store.getState().session.activeLayoutId).toBe(
      'layout-bath',
    );
    expect(store.getState().session.selection).toEqual({
      kind: 'layout',
      id: 'layout-bath',
    });

    commands.execute(deleteLayout('layout-bath'));
    commands.execute(deleteLayout('layout-kitchen'));

    expect(store.getState().project.layouts).toHaveLength(1);
    expect(store.getState().project.layouts[0]?.id).toBe(
      'layout-kitchen',
    );
  });

  it('reorders Layouts without changing active identity', () => {
    const { store, commands } = setup();
    const active = store.getState().session.activeLayoutId;

    commands.execute(
      reorderLayouts(['layout-bath', 'layout-kitchen']),
    );

    expect(
      store.getState().project.layouts.map((layout) => layout.id),
    ).toEqual(['layout-bath', 'layout-kitchen']);
    expect(store.getState().session.activeLayoutId).toBe(active);
  });
});

describe('Area ownership commands', () => {
  it('adds an Area, makes it active, and selects it on the active Layout', () => {
    const { store, commands } = setup();

    commands.execute(
      setActiveArea('layout-bath', 'area-bath', { select: true }),
    );
    commands.execute(
      addArea('layout-bath', {
        id: 'area-shower',
        name: 'Shower',
      }),
    );

    const layout = store
      .getState()
      .project.layouts.find((item) => item.id === 'layout-bath');

    expect(layout?.activeAreaId).toBe('area-shower');
    expect(layout?.areas.at(-1)).toEqual({
      id: 'area-shower',
      name: 'Shower',
    });
    expect(store.getState().session.selection).toEqual({
      kind: 'area',
      id: 'area-shower',
    });
  });

  it('keeps active-Area navigation out of history but persists it', () => {
    const { commands } = setup();

    commands.execute(setActiveLayout('layout-kitchen'));
    const event = commands.execute(
      setActiveArea('layout-kitchen', 'area-kitchen', {
        select: true,
      }),
    );

    expect(event?.history).toBe('skip');
    expect(event?.persistence).toBe('save');
  });

  it('renames and reorders Areas deterministically', () => {
    const { store, commands } = setup();

    commands.execute(
      renameArea('layout-kitchen', 'area-island', 'Main Island'),
    );
    commands.execute(
      reorderAreas('layout-kitchen', [
        'area-island',
        'area-kitchen',
      ]),
    );

    const layout = store.getState().project.layouts[0];
    expect(layout?.areas.map((area) => area.name)).toEqual([
      'Main Island',
      'Kitchen',
    ]);
  });

  it('moves Piece Groups and linked splashes as one Area family', () => {
    const { store, commands } = setup();
    const layout = store.getState().project.layouts[0];
    if (!layout) throw new Error('Missing fixture Layout');
    layout.pieces = kitchenPieces();

    commands.execute(
      assignPiecesToArea(
        'layout-kitchen',
        ['splash-a'],
        'area-island',
      ),
    );

    const byId = new Map(
      (store.getState().project.layouts[0]?.pieces ?? []).map(
        (piece) => [piece.id, piece],
      ),
    );

    expect(byId.get('piece-a')?.areaId).toBe('area-island');
    expect(byId.get('piece-b')?.areaId).toBe('area-island');
    expect(byId.get('splash-a')?.areaId).toBe('area-island');
    expect(byId.get('piece-c')?.areaId).toBe('area-island');
  });

  it('deletes an Area by moving its Pieces to the first fallback Area', () => {
    const { store, commands } = setup();
    const layout = store.getState().project.layouts[0];
    if (!layout) throw new Error('Missing fixture Layout');
    layout.pieces = kitchenPieces();

    const plan = getAreaDeletionPlan(
      layout,
      'area-kitchen',
    );
    expect(plan).toMatchObject({
      areaId: 'area-kitchen',
      fallbackAreaId: 'area-island',
    });
    expect(plan?.affectedPieceIds).toEqual([
      'piece-a',
      'piece-b',
      'splash-a',
    ]);

    commands.execute(setActiveLayout('layout-kitchen'));
    commands.execute(
      setActiveArea('layout-kitchen', 'area-kitchen', {
        select: true,
      }),
    );
    commands.execute(deleteArea('layout-kitchen', 'area-kitchen'));

    const next = store.getState().project.layouts[0];
    expect(next?.areas).toEqual([
      { id: 'area-island', name: 'Island' },
    ]);
    expect(next?.activeAreaId).toBe('area-island');
    expect(next?.pieces.every(
      (piece) => piece.areaId === 'area-island',
    )).toBe(true);
    expect(store.getState().session.selection).toEqual({
      kind: 'area',
      id: 'area-island',
    });
  });

  it('preserves a different active Area when deleting a non-active Area', () => {
    const { store, commands } = setup();
    const layout = store.getState().project.layouts[0];
    if (!layout) throw new Error('Missing fixture Layout');
    layout.pieces = kitchenPieces();

    commands.execute(setActiveLayout('layout-kitchen'));
    expect(layout.activeAreaId).toBe('area-island');

    commands.execute(deleteArea('layout-kitchen', 'area-kitchen'));

    expect(
      store.getState().project.layouts[0]?.activeAreaId,
    ).toBe('area-island');
  });

  it('refuses to delete the final Area', () => {
    const { store, commands } = setup();

    const before = store.getRevision();
    const event = commands.execute(
      deleteArea('layout-bath', 'area-bath'),
    );

    expect(event).toBeNull();
    expect(store.getRevision()).toBe(before);
  });
});
