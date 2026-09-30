import { describe, expect, it } from 'vitest';

import {
  addSlabSurface,
  applicationStateFromLegacyPayload,
  deleteSlabSurface,
  updateSlabSurface,
} from '../src/app';
import {
  createBlankSlabSurface,
  slabSurfaceImageSource,
  slabUsableBounds,
} from '../src/domain/slabs';
import {
  createPieceCanvasProjection,
  hitTestSlabCanvas,
} from '../src/browser';
import {
  createPieceMoveSession,
  previewPieceMove,
} from '../src/app/interaction/pieces';
import type { ToolPointerInput } from '../src/app';
import { migrateCadLiteFile } from '../src/persistence';
import { v159ProjectFixture } from './fixtures/v159-project';

function slabPayload(workspace: 'design' | 'slab' = 'slab') {
  return {
    sinkSideConvention: 'front-bottom-v1',
    project: { name: 'Slabs', date: '2026-09-30', notes: '' },
    materials: [],
    layouts: [
      {
        id: 'layout',
        name: 'Layout',
        quantity: 1,
        cw: 200,
        ch: 120,
        scale: 8,
        grid: 1,
        showGrid: true,
        pieceFillOpacity: 1,
        areas: [{ id: 'a', name: 'A' }],
        activeAreaId: 'a',
        pieces: [
          {
            id: 'piece',
            name: 'Nested Piece',
            areaId: 'a',
            x: 10,
            y: 20,
            w: 20,
            h: 10,
            rotation: 0,
            layer: 1,
            color: '#ffffff',
            slabPlacement: { x: 10, y: 20, rotation: 0 },
          },
        ],
        dims: [],
        notes: [],
        lines: [],
        roomFeatures: [],
        plan: null,
        overlays: [
          {
            id: 'existing',
            name: 'Existing',
            slabW: 126,
            slabH: 63,
            x: 2,
            y: 3,
            opacity: 0.8,
            visible: true,
            dataURL: 'data:image/png;base64,abc',
          },
        ],
        slabCW: 220,
        slabCH: 130,
      },
    ],
    ui: {
      workspace: workspace === 'slab' ? 'slab' : 'layout',
      gridSnap: false,
      pieceSnap: true,
      slabEdgeAllowance: 1.5,
      defaultSlabW: 126,
      defaultSlabH: 63,
      showSlabMaterial: true,
      dimPrecision: 16,
      dimFormat: 'fraction',
    },
    active: 0,
  };
}

describe('typed SLAB surfaces', () => {
  it('promotes v1.5.99 overlays while preserving layout-level slab canvas metadata', () => {
    const migrated = migrateCadLiteFile(v159ProjectFixture);
    const layout = migrated.project.layouts[0];
    const slab = layout?.overlays[0];

    expect(slab).toMatchObject({
      id: 'slab-1',
      name: 'Slab 1',
      slabW: 126,
      slabH: 63,
      x: 2,
      y: 2,
      opacity: 1,
      visible: true,
    });
    expect(layout?.extra).toEqual({
      slabCW: 300,
      slabCH: 200,
      ovSel: 0,
    });
  });

  it('derives the usable cut boundary from the configured edge allowance', () => {
    const slab = createBlankSlabSurface(
      'slab',
      'Blank',
      126,
      63,
      4,
      6,
    );

    expect(slabUsableBounds(slab, 1.5)).toEqual({
      x: 5.5,
      y: 7.5,
      w: 123,
      h: 60,
    });
  });

  it('preserves legacy image payloads behind one image-source selector', () => {
    const state = applicationStateFromLegacyPayload(slabPayload());
    const slab = state.project.layouts[0]?.overlays[0];
    if (!slab) throw new Error('Missing slab');

    expect(slabSurfaceImageSource(slab)).toBe(
      'data:image/png;base64,abc',
    );
  });
});

describe('SLAB surface commands', () => {
  it('adds, edits, selects, and deletes a slab as command transactions', () => {
    const state = applicationStateFromLegacyPayload(slabPayload());
    const added = createBlankSlabSurface(
      'new-slab',
      'Blank Slab',
      120,
      60,
      10,
      12,
    );

    const afterAdd = addSlabSurface('layout', added).reduce(state);
    expect(afterAdd.project.layouts[0]?.overlays).toHaveLength(2);
    expect(afterAdd.session.selection).toEqual({
      kind: 'slab',
      id: 'new-slab',
    });

    const afterEdit = updateSlabSurface(
      'layout',
      'new-slab',
      {
        name: 'Remnant',
        slabW: 100,
        x: 18.25,
        opacity: 0.55,
        visible: false,
      },
    ).reduce(afterAdd);
    expect(
      afterEdit.project.layouts[0]?.overlays.find(
        (slab) => slab.id === 'new-slab',
      ),
    ).toMatchObject({
      name: 'Remnant',
      slabW: 100,
      x: 18.25,
      opacity: 0.55,
      visible: false,
    });

    const afterDelete = deleteSlabSurface(
      'layout',
      'new-slab',
    ).reduce(afterEdit);
    expect(
      afterDelete.project.layouts[0]?.overlays.map((slab) => slab.id),
    ).toEqual(['existing']);
    expect(afterDelete.session.selection).toEqual({ kind: 'none' });
  });

  it('keeps slab mutations inert outside the active SLAB workspace', () => {
    const design = applicationStateFromLegacyPayload(
      slabPayload('design'),
    );
    const added = createBlankSlabSurface(
      'new-slab',
      'Blank Slab',
    );

    expect(addSlabSurface('layout', added).reduce(design)).toBe(design);
    expect(
      updateSlabSurface('layout', 'existing', { x: 40 }).reduce(design),
    ).toBe(design);
    expect(
      deleteSlabSurface('layout', 'existing').reduce(design),
    ).toBe(design);
  });
});


function pointer(x: number, y: number): ToolPointerInput {
  return {
    pointerId: 1,
    x,
    y,
    button: 0,
    buttons: 1,
    modifiers: {
      shift: false,
      alt: false,
      ctrl: false,
      meta: false,
    },
  };
}

describe('SLAB workspace projection and nesting', () => {
  it('projects visible slab surfaces and hit-tests them below Pieces', () => {
    const state = applicationStateFromLegacyPayload(slabPayload());
    state.session.selection = { kind: 'slab', id: 'existing' };

    const projection = createPieceCanvasProjection(state);
    expect(projection.workspace).toBe('slab');
    expect(projection.slabs).toHaveLength(1);
    expect(projection.slabs[0]).toMatchObject({
      id: 'existing',
      selected: true,
      imageSource: 'data:image/png;base64,abc',
      usableBounds: {
        x: 3.5,
        y: 4.5,
        w: 123,
        h: 60,
      },
    });
    expect(
      hitTestSlabCanvas(projection, { x: 5, y: 5 })?.id,
    ).toBe('existing');
    expect(
      hitTestSlabCanvas(projection, { x: 150, y: 5 }),
    ).toBeNull();
  });

  it('snaps a nested Piece to the usable slab edge before grid/object fallbacks', () => {
    const state = applicationStateFromLegacyPayload(slabPayload());
    const session = createPieceMoveSession(
      state,
      ['piece'],
      'piece',
      null,
      pointer(10, 20),
    );
    if (!session) throw new Error('Missing Piece move session');

    const preview = previewPieceMove(
      state,
      session,
      pointer(3.8, 20),
    );
    expect(preview?.pieces[0]?.pose.x).toBe(3.5);
    expect(preview?.guideX).toBe(3.5);
  });
});
