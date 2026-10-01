import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  addLinkedSplash,
  applicationStateFromLegacyPayload,
  updatePieceEdgeProperties,
} from '../src/app';
import { linkedSplashForEdge } from '../src/domain/pieces';

function setup() {
  const store = new AppStore(applicationStateFromLegacyPayload({
    project: { name: 'Miter Test', date: '2026-10-01', notes: '' },
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
            color: '#ffffff',
            cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 },
            edgeProfiles: {
              top: 'none',
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
  }));
  return { store, commands: new CommandDispatcher(store) };
}

describe('linked splash miter synchronization', () => {
  it('mirrors a parent-edge miter onto the linked Splash contact edge', () => {
    const { store, commands } = setup();
    commands.execute(addLinkedSplash('layout', 'parent', 'splash', 'top'));
    commands.execute(
      updatePieceEdgeProperties('layout', 'parent', {
        edgeProfiles: { top: 'miter' },
      }),
    );

    const pieces = store.getState().project.layouts[0]?.pieces ?? [];
    expect(linkedSplashForEdge(pieces, 'parent', 'top')?.edgeProfiles.bottom)
      .toBe('miter');
  });

  it('clears the parent miter when the linked Splash contact edge stops being mitered', () => {
    const { store, commands } = setup();
    commands.execute(
      updatePieceEdgeProperties('layout', 'parent', {
        edgeProfiles: { top: 'miter' },
      }),
    );
    commands.execute(addLinkedSplash('layout', 'parent', 'splash', 'top'));
    commands.execute(
      updatePieceEdgeProperties('layout', 'splash', {
        edgeProfiles: { bottom: 'none' },
      }),
    );

    const parent = store.getState().project.layouts[0]?.pieces
      .find((piece) => piece.id === 'parent');
    expect(parent?.edgeProfiles.top).toBe('none');
  });

  it('does not coerce unrelated custom profile strings', () => {
    const { store, commands } = setup();
    commands.execute(addLinkedSplash('layout', 'parent', 'splash', 'top'));
    commands.execute(
      updatePieceEdgeProperties('layout', 'parent', {
        edgeProfiles: { top: 'Custom Laminated Edge' },
      }),
    );

    const pieces = store.getState().project.layouts[0]?.pieces ?? [];
    const parent = pieces.find((piece) => piece.id === 'parent');
    const splash = linkedSplashForEdge(pieces, 'parent', 'top');
    expect(parent?.edgeProfiles.top).toBe('Custom Laminated Edge');
    expect(splash?.edgeProfiles.bottom).toBe('none');
  });
});
