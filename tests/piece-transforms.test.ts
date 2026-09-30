import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  HistoryManager,
  PieceInteractionController,
  applicationStateFromLegacyPayload,
  mirrorPieces,
  resizePieceDimension,
  setSelection,
  type ToolPointerInput,
} from '../src/app';
import {
  mirrorPiecesInLayout,
  nudgePieceGroup,
  pieceRotationFamilyIds,
  pieceTransformGroupCenter,
  resizePieceDimensionInLayout,
  rotatePieceGroup,
} from '../src/domain/pieces';
import { normalizePieces } from '../src/persistence/pieces';

function pointer(
  x: number,
  y: number,
  options: Partial<ToolPointerInput> = {},
): ToolPointerInput {
  return {
    pointerId: options.pointerId ?? 1,
    x,
    y,
    button: options.button ?? 0,
    buttons: options.buttons ?? 1,
    modifiers: {
      shift: options.modifiers?.shift ?? false,
      alt: options.modifiers?.alt ?? false,
      ctrl: options.modifiers?.ctrl ?? false,
      meta: options.modifiers?.meta ?? false,
    },
  };
}

function payload(workspace: 'design' | 'slab' = 'design') {
  return {
    sinkSideConvention: 'front-bottom-v1',
    project: {
      name: 'Transforms',
      date: '2026-09-30',
      notes: '',
    },
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
        slabCW: 200,
        slabCH: 120,
        areas: [{ id: 'a', name: 'A' }],
        activeAreaId: 'a',
        pieces: [
          {
            id: 'p',
            name: 'P',
            areaId: 'a',
            x: 30,
            y: 30,
            w: 40,
            h: 20,
            rotation: 0,
            layer: 1,
            color: '#ffffff',
            slabPlacement: { x: 20, y: 70, rotation: 10 },
            assemblyLinks: [
              {
                id: 'join',
                kind: 'seam',
                matePieceId: 'q',
                sourceSeamId: 'seam-p',
                side: 'right',
              },
            ],
            pieceSeams: [
              {
                id: 'seam-p',
                orientation: 'vertical',
                reference: 'left',
                offset: 35,
              },
            ],
            sinks: [
              {
                id: 'sink-p',
                side: 'front',
                centerline: 10,
                rotation: 30,
                faucets: [0, 2, 8],
                fabricationSplitSinkId: 'split-sink',
                fabricationPose: { cx: 10, cy: 8 },
              },
            ],
            cutouts: [
              {
                id: 'cutout-p',
                cx: 12,
                cy: 7,
                fabricationSplitCutoutId: 'split-cutout',
              },
            ],
            cornerRadii: { tl: 1, tr: 2, br: 3, bl: 4 },
            edgeProfiles: {
              top: 'eased',
              right: 'miter',
              bottom: 'flat',
              left: 'bevel',
            },
            overhangs: { front: 1.5, back: 0.25, left: 2, right: 3 },
          },
          {
            id: 'q',
            name: 'Q',
            areaId: 'a',
            x: 70,
            y: 30,
            w: 30,
            h: 20,
            rotation: 0,
            layer: 2,
            color: '#ffffff',
            slabPlacement: { x: 70, y: 70, rotation: 20 },
            assemblyLinks: [
              {
                id: 'join',
                kind: 'seam',
                matePieceId: 'p',
                sourceSeamId: 'seam-p',
                side: 'left',
              },
            ],
          },
          {
            id: 'splash',
            name: 'Splash',
            areaId: 'a',
            x: 30,
            y: 24,
            w: 40,
            h: 4,
            rotation: 0,
            layer: 3,
            color: '#ffffff',
            pieceType: 'backsplash',
            attachment: {
              kind: 'backsplash',
              parentPieceId: 'p',
              sourceEdge: 'top',
              snapped: true,
            },
            slabPlacement: { x: 120, y: 90, rotation: 0 },
          },
          {
            id: 'other',
            name: 'Other',
            areaId: 'a',
            x: 130,
            y: 30,
            w: 20,
            h: 20,
            rotation: 15,
            layer: 4,
            color: '#ffffff',
            slabPlacement: { x: 140, y: 60, rotation: 25 },
          },
        ],
        dims: [],
        notes: [],
        lines: [],
        roomFeatures: [],
        plan: null,
        overlays: [],
      },
    ],
    ui: {
      workspace: workspace === 'slab' ? 'slab' : 'layout',
      gridSnap: true,
      pieceSnap: true,
      slabCutClearance: 0.25,
      showGrid: true,
      showDims: true,
      dimPrecision: 16,
      dimFormat: 'fraction',
    },
    active: 0,
  };
}

function setup(workspace: 'design' | 'slab' = 'design') {
  const state = applicationStateFromLegacyPayload(payload(workspace));
  const store = new AppStore(state);
  const commands = new CommandDispatcher(store);
  return {
    store,
    commands,
    controller: new PieceInteractionController(store, commands),
  };
}

function layout() {
  const state = applicationStateFromLegacyPayload(payload());
  const result = state.project.layouts[0];
  if (!result) throw new Error('Missing Layout');
  return result;
}

describe('Piece rotation families and poses', () => {
  it('expands DESIGN fabrication assemblies and snapped splashes, but not SLAB selection', () => {
    const current = layout();
    expect(pieceRotationFamilyIds(current, ['p'], 'design')).toEqual([
      'p',
      'q',
      'splash',
    ]);
    expect(pieceRotationFamilyIds(current, ['p'], 'slab')).toEqual(['p']);
    expect(pieceRotationFamilyIds(current, ['splash'], 'design')).toEqual([]);
  });

  it('rotates a DESIGN family rigidly around its bounding-box center', () => {
    const current = layout();
    const center = pieceTransformGroupCenter(
      current,
      ['p', 'q', 'splash'],
      'design',
    );
    const updates = rotatePieceGroup(current, ['p'], 'design', 90);

    expect(updates.map((item) => item.id)).toEqual(['p', 'q', 'splash']);
    expect(updates.every((item) => item.pose.rotation === 90)).toBe(true);
    expect(center).not.toBeNull();

    const updatedCenters = updates.map((update) => {
      const piece = current.pieces.find((item) => item.id === update.id);
      if (!piece) throw new Error('Missing Piece');
      const angle = update.pose.rotation * Math.PI / 180;
      const w =
        Math.abs(piece.w * Math.cos(angle)) +
        Math.abs(piece.h * Math.sin(angle));
      const h =
        Math.abs(piece.w * Math.sin(angle)) +
        Math.abs(piece.h * Math.cos(angle));
      return {
        x: update.pose.x + w / 2,
        y: update.pose.y + h / 2,
      };
    });
    const minX = Math.min(...updatedCenters.map((item) => item.x));
    const maxX = Math.max(...updatedCenters.map((item) => item.x));
    const minY = Math.min(...updatedCenters.map((item) => item.y));
    const maxY = Math.max(...updatedCenters.map((item) => item.y));
    expect((minX + maxX) / 2).toBeCloseTo(center?.x ?? 0, 3);
    expect((minY + maxY) / 2).toBeCloseTo(center?.y ?? 0, 3);
  });

  it('soft-snaps within 5 degrees, Shift hard-snaps, and Alt bypasses soft snapping', () => {
    const { store, commands, controller } = setup();
    commands.execute(setSelection({ kind: 'pieces', ids: ['other'] }));
    const current = store.getState().project.layouts[0];
    if (!current) throw new Error('Missing Layout');
    const center = pieceTransformGroupCenter(current, ['other'], 'design');
    if (!center) throw new Error('Missing center');

    controller.beginRotate(pointer(center.x + 10, center.y));
    controller.pointerMove(
      pointer(
        center.x + Math.cos(88 * Math.PI / 180) * 10,
        center.y + Math.sin(88 * Math.PI / 180) * 10,
      ),
    );
    expect(
      controller.getPreview()?.pieces.find((item) => item.id === 'other')
        ?.pose.rotation,
    ).toBe(90);
    controller.cancel();

    controller.beginRotate(pointer(center.x + 10, center.y));
    controller.pointerMove(
      pointer(
        center.x + Math.cos(88 * Math.PI / 180) * 10,
        center.y + Math.sin(88 * Math.PI / 180) * 10,
        {
          modifiers: { shift: false, alt: true, ctrl: false, meta: false },
        },
      ),
    );
    expect(
      controller.getPreview()?.pieces.find((item) => item.id === 'other')
        ?.pose.rotation,
    ).toBeCloseTo(103, 3);
    controller.cancel();

    controller.beginRotate(pointer(center.x + 10, center.y));
    controller.pointerMove(
      pointer(
        center.x + Math.cos(46 * Math.PI / 180) * 10,
        center.y + Math.sin(46 * Math.PI / 180) * 10,
        {
          modifiers: { shift: true, alt: false, ctrl: false, meta: false },
        },
      ),
    );
    expect(
      controller.getPreview()?.pieces.find((item) => item.id === 'other')
        ?.pose.rotation,
    ).toBe(90);
  });

  it('commits a rotate drag as one undoable transform and double-step rotation is direct', () => {
    const { store, commands, controller } = setup();
    commands.execute(setSelection({ kind: 'pieces', ids: ['other'] }));
    const history = new HistoryManager(store);
    history.start();
    const current = store.getState().project.layouts[0];
    if (!current) throw new Error('Missing Layout');
    const center = pieceTransformGroupCenter(current, ['other'], 'design');
    if (!center) throw new Error('Missing center');

    controller.beginRotate(pointer(center.x + 10, center.y));
    controller.pointerMove(pointer(center.x, center.y + 10));
    controller.pointerUp(pointer(center.x, center.y + 10, { buttons: 0 }));

    expect(history.getStatus()).toMatchObject({
      size: 2,
      undoLabel: 'Rotate pieces',
    });
    expect(
      store.getState().project.layouts[0]?.pieces.find(
        (piece) => piece.id === 'other',
      )?.rotation,
    ).toBe(90);

    expect(controller.rotateSelectionBy(90)).toBe(true);
    expect(
      store.getState().project.layouts[0]?.pieces.find(
        (piece) => piece.id === 'other',
      )?.rotation,
    ).toBe(180);
    history.stop();
  });
});

describe('Piece keyboard nudge', () => {
  it('expands the DESIGN move family and clamps it as one rigid translation', () => {
    const current = layout();
    const updates = nudgePieceGroup(current, ['p'], 'design', 2, 3);
    expect(updates.map((item) => item.id)).toEqual(['p', 'q', 'splash']);
    expect(updates.find((item) => item.id === 'p')?.pose).toMatchObject({
      x: 32,
      y: 33,
    });
    expect(updates.find((item) => item.id === 'q')?.pose).toMatchObject({
      x: 72,
      y: 33,
    });
    expect(updates.find((item) => item.id === 'splash')?.pose).toMatchObject({
      x: 32,
      y: 27,
    });
  });

  it('keeps SLAB nudge limited to explicitly selected Pieces', () => {
    const current = layout();
    const updates = nudgePieceGroup(current, ['p'], 'slab', 4, 0);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: 'p',
      pose: { x: 24, y: 70, rotation: 10 },
    });
  });

  it('keeps repeat nudges transient until keyup and commits one history step', () => {
    const { store, commands, controller } = setup();
    commands.execute(setSelection({ kind: 'pieces', ids: ['p', 'q'] }));
    const history = new HistoryManager(store);
    history.start();

    expect(controller.nudgeKeyDown('ArrowRight')).toBe(true);
    expect(controller.nudgeKeyDown('ArrowRight')).toBe(true);
    expect(
      store.getState().project.layouts[0]?.pieces.find(
        (piece) => piece.id === 'p',
      )?.x,
    ).toBe(30);
    expect(
      controller.getPreview()?.pieces.find((item) => item.id === 'p')?.pose.x,
    ).toBe(32);
    expect(history.getStatus().size).toBe(1);

    expect(controller.nudgeKeyUp('ArrowRight')).toBe(true);
    expect(
      store.getState().project.layouts[0]?.pieces.find(
        (piece) => piece.id === 'p',
      )?.x,
    ).toBe(32);
    expect(history.getStatus()).toMatchObject({
      size: 2,
      undoLabel: 'Nudge pieces',
    });
    history.stop();
  });

  it('detaches a snapped splash nudged without its parent', () => {
    const { store, commands, controller } = setup();
    commands.execute(setSelection({ kind: 'pieces', ids: ['splash'] }));
    controller.nudgeKeyDown('ArrowRight');
    controller.nudgeKeyUp('ArrowRight');

    expect(
      store.getState().project.layouts[0]?.pieces.find(
        (piece) => piece.id === 'splash',
      )?.attachment?.snapped,
    ).toBe(false);
  });
});

describe('Piece mirror compatibility', () => {
  it('mirrors local countertop metadata and preserves v1.5.99 cutout behavior', () => {
    const current = layout();
    const next = mirrorPiecesInLayout(current, ['p', 'q'], 'h');
    const p = next.find((piece) => piece.id === 'p');
    if (!p) throw new Error('Missing Piece');

    expect(p.rotation).toBe(0);
    expect(p.cornerRadii).toEqual({ tl: 2, tr: 1, br: 4, bl: 3 });
    expect(p.edgeProfiles).toEqual({
      top: 'eased',
      right: 'bevel',
      bottom: 'flat',
      left: 'miter',
    });
    expect(p.overhangs).toEqual({
      front: 1.5,
      back: 0.25,
      left: 3,
      right: 2,
    });
    expect(p.pieceSeams[0]).toMatchObject({
      orientation: 'vertical',
      reference: 'right',
    });
    expect(p.sinks[0]).toMatchObject({
      centerline: 30,
      rotation: 330,
      faucets: [0, 6, 8],
    });
    expect(p.cutouts[0]).toMatchObject({ cx: 12, cy: 7 });
  });

  it('includes a linked splash parent and swaps its source edge in a vertical mirror', () => {
    const current = layout();
    const next = mirrorPiecesInLayout(current, ['splash'], 'v');
    const splash = next.find((piece) => piece.id === 'splash');
    const parent = next.find((piece) => piece.id === 'p');
    expect(splash?.attachment?.sourceEdge).toBe('bottom');
    expect(parent).not.toBe(current.pieces.find((piece) => piece.id === 'p'));
  });

  it('is DESIGN-only at the command boundary and remains undoable', () => {
    const { store, commands } = setup();
    commands.execute(setSelection({ kind: 'pieces', ids: ['p', 'q'] }));
    const history = new HistoryManager(store);
    history.start();

    expect(commands.execute(mirrorPieces('layout', ['p', 'q'], 'h'))).not.toBeNull();
    expect(history.getStatus()).toMatchObject({
      size: 2,
      undoLabel: 'Mirror pieces horizontally',
    });

    history.undo();
    expect(
      store.getState().project.layouts[0]?.pieces.find(
        (piece) => piece.id === 'p',
      )?.cornerRadii,
    ).toEqual({ tl: 1, tr: 2, br: 3, bl: 4 });
    history.stop();

    const slab = setup('slab');
    expect(
      slab.commands.execute(mirrorPieces('layout', ['p'], 'h')),
    ).toBeNull();
  });
});

describe('graph-aware dimension editing', () => {
  it('keeps a fabrication seam edge fixed and shifts split fabrication children', () => {
    const current = layout();
    const resized = resizePieceDimensionInLayout(
      current,
      'p',
      'width',
      30,
    );
    if (!resized) throw new Error('Missing resized Piece');

    // Right seam is the fixed joint: shrinking 40 -> 30 moves only the left edge.
    expect(resized).toMatchObject({
      w: 30,
      x: 40,
      slabPlacement: { x: 30 },
    });
    expect(resized.sinks[0]?.fabricationPose).toMatchObject({
      cx: 0,
      cy: 8,
    });
    expect(resized.cutouts[0]).toMatchObject({ cx: 2, cy: 7 });
    expect(resized.pieceSeams[0]?.offset).toBe(30);
  });

  it('uses the graph-aware resize command as one undoable edit', () => {
    const { store, commands } = setup();
    const history = new HistoryManager(store);
    history.start();

    expect(
      commands.execute(
        resizePieceDimension('layout', 'p', 'width', 30),
      ),
    ).not.toBeNull();
    expect(history.getStatus()).toMatchObject({
      size: 2,
      undoLabel: 'Resize piece',
    });
    expect(
      store.getState().project.layouts[0]?.pieces.find(
        (piece) => piece.id === 'p',
      ),
    ).toMatchObject({ w: 30, x: 40 });

    history.undo();
    expect(
      store.getState().project.layouts[0]?.pieces.find(
        (piece) => piece.id === 'p',
      ),
    ).toMatchObject({ w: 40, x: 30 });
    history.stop();
  });

  it('rounds Inspector-style dimensions to production precision without altering unrelated children', () => {
    const current = layout();
    const standalone = normalizePieces(
      [
        {
          id: 'standalone',
          areaId: 'a',
          x: 10,
          y: 10,
          w: 20,
          h: 10,
          rotation: 0,
          sinks: [{ id: 'sink', centerline: 8.123456 }],
        },
      ],
      ['a'],
      'standalone',
    )[0];
    if (!standalone) throw new Error('Missing standalone Piece');
    current.pieces = [standalone];

    const resized = resizePieceDimensionInLayout(
      current,
      'standalone',
      'width',
      21.1236,
    );
    expect(resized?.w).toBe(21.124);
    expect(resized?.x).toBe(10);
    expect(resized?.sinks[0]?.centerline).toBe(8.123456);
  });
});
