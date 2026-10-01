import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  addLinkedSplash,
  applicationStateFromLegacyPayload,
  removeLinkedSplash,
  setWorkspace,
} from '../src/app';
import {
  linkedSplashForEdge,
  linkedSplashPlacement,
  normalizeSplashHeight,
  normalizeSplashOffset,
  synchronizeLinkedSplashes,
} from '../src/domain/pieces';

function payload() {
  return {
    project: { name: 'Splash Test', date: '2026-10-01', notes: '' },
    materials: [],
    layouts: [
      {
        id: 'layout',
        name: 'Kitchen',
        quantity: 1,
        cw: 120,
        ch: 100,
        scale: 6,
        grid: 1,
        showGrid: true,
        pieceFillOpacity: 1,
        areas: [{ id: 'area', name: 'Kitchen' }],
        activeAreaId: 'area',
        pieces: [
          {
            id: 'parent',
            name: 'Countertop',
            areaId: 'area',
            x: 20,
            y: 20,
            w: 40,
            h: 25.5,
            rotation: 0,
            layer: 1,
            color: '#abcdef',
            fillOpacity: 0.7,
            noFill: false,
            cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 },
            edgeProfiles: {
              top: 'miter',
              right: 'none',
              bottom: 'none',
              left: 'none',
            },
            sinks: [],
            cutouts: [],
            pieceSeams: [],
          },
        ],
        dims: [],
        notes: [],
        lines: [],
        roomFeatures: [],
        plan: null,
        overlays: [],
        slabCW: 120,
        slabCH: 100,
      },
    ],
    ui: { workspace: 'layout' },
    active: 0,
  };
}

function setup() {
  const store = new AppStore(applicationStateFromLegacyPayload(payload()));
  const commands = new CommandDispatcher(store);
  return { store, commands };
}

describe('linked splash production parity', () => {
  it('normalizes the production height and offset bounds', () => {
    expect(normalizeSplashHeight(undefined)).toBe(4);
    expect(normalizeSplashHeight(0)).toBe(0.25);
    expect(normalizeSplashHeight(99)).toBe(24);
    expect(normalizeSplashOffset(-2)).toBe(0);
    expect(normalizeSplashOffset(2)).toBe(1);
  });

  it('projects edge-relative placement using the parent geometry', () => {
    const { store } = setup();
    const parent = store.getState().project.layouts[0]?.pieces[0];
    expect(parent).toBeTruthy();
    if (!parent) return;

    expect(linkedSplashPlacement(parent, 'top', 4, 0)).toMatchObject({
      edge: 'top',
      length: 40,
      height: 4,
      offset: 0,
      x: 20,
      y: 16,
      rotation: 0,
    });
    expect(linkedSplashPlacement(parent, 'right', 4, 0)).toMatchObject({
      edge: 'right',
      length: 25.5,
      x: 60,
      y: 20,
      rotation: 90,
    });
  });

  it('adds one linked child per edge and keeps the parent selected', () => {
    const { store, commands } = setup();

    commands.execute(addLinkedSplash('layout', 'parent', 'splash-top', 'top'));
    const state = store.getState();
    const layout = state.project.layouts[0];
    const splash = layout?.pieces.find((piece) => piece.id === 'splash-top');

    expect(splash).toMatchObject({
      name: 'Splash',
      areaId: 'area',
      w: 40,
      h: 4,
      x: 20,
      y: 16,
      rotation: 0,
      color: '#abcdef',
      fillOpacity: 0.7,
      pieceType: 'backsplash',
      tags: ['backsplash'],
      splashKind: 'splash',
      splashHeight: 4,
      attachment: {
        kind: 'backsplash',
        parentPieceId: 'parent',
        sourceEdge: 'top',
        linkedLength: true,
        snapped: true,
        offset: 0,
      },
    });
    expect(splash?.edgeProfiles.bottom).toBe('miter');
    expect(layout?.pieces.map((piece) => piece.id)).toEqual([
      'parent',
      'splash-top',
    ]);
    expect(state.session.selection).toEqual({ kind: 'pieces', ids: ['parent'] });

    const before = store.getState();
    expect(
      commands.execute(addLinkedSplash('layout', 'parent', 'duplicate', 'top')),
    ).toBeNull();
    expect(store.getState()).toBe(before);
  });

  it('normalizes add options and detaches a clamped edge from snap state', () => {
    const { store, commands } = setup();
    const current = store.getState();
    const layout = current.project.layouts[0];
    const parent = layout?.pieces[0];
    if (!layout || !parent) return;

    store.replaceForProjectLifecycle({
      ...current,
      project: {
        ...current.project,
        layouts: [
          {
            ...layout,
            pieces: [{ ...parent, x: 0, y: 0 }],
          },
        ],
      },
    });

    commands.execute(
      addLinkedSplash('layout', 'parent', 'splash-top', 'top', {
        height: 99,
        offset: 9,
      }),
    );
    const splash = linkedSplashForEdge(
      store.getState().project.layouts[0]?.pieces ?? [],
      'parent',
      'top',
    );
    expect(splash?.h).toBe(24);
    expect(splash?.attachment?.offset).toBe(1);
    expect(splash?.attachment?.snapped).toBe(false);
    expect(splash?.y).toBe(0);
  });

  it('removes only the linked child for the requested edge', () => {
    const { store, commands } = setup();
    commands.execute(addLinkedSplash('layout', 'parent', 'top', 'top'));
    commands.execute(addLinkedSplash('layout', 'parent', 'right', 'right'));
    commands.execute(removeLinkedSplash('layout', 'parent', 'top'));

    const pieces = store.getState().project.layouts[0]?.pieces ?? [];
    expect(linkedSplashForEdge(pieces, 'parent', 'top')).toBeNull();
    expect(linkedSplashForEdge(pieces, 'parent', 'right')?.id).toBe('right');
    expect(store.getState().session.selection).toEqual({
      kind: 'pieces',
      ids: ['parent'],
    });
  });

  it('keeps linked length and snapped placement synchronized with its parent', () => {
    const { store, commands } = setup();
    commands.execute(addLinkedSplash('layout', 'parent', 'top', 'top'));
    const layout = store.getState().project.layouts[0];
    const parent = layout?.pieces.find((piece) => piece.id === 'parent');
    if (!layout || !parent) return;

    const editedPieces = layout.pieces.map((piece) =>
      piece.id === 'parent'
        ? { ...piece, x: 30, w: 50 }
        : piece,
    );
    const synced = synchronizeLinkedSplashes(
      { ...layout, pieces: editedPieces },
      editedPieces,
    );
    const child = linkedSplashForEdge(synced, 'parent', 'top');
    expect(child).toMatchObject({ w: 50, x: 30, y: 16, rotation: 0 });
  });

  it('does not add or remove linked splashes from SLAB', () => {
    const { store, commands } = setup();
    commands.execute(setWorkspace('slab'));
    expect(
      commands.execute(addLinkedSplash('layout', 'parent', 'top', 'top')),
    ).toBeNull();
    expect(store.getState().project.layouts[0]?.pieces).toHaveLength(1);
  });
});
