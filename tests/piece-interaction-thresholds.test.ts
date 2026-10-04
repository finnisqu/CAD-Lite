import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  PieceInteractionController,
  applicationStateFromLegacyPayload,
} from '../src/app';
import type { ToolPointerInput } from '../src/app';

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

function setup(workspace: 'design' | 'slab') {
  const state = applicationStateFromLegacyPayload({
    sinkSideConvention: 'front-bottom-v1',
    project: { name: 'Thresholds', date: '2026-10-04', notes: '' },
    materials: [],
    layouts: [
      {
        id: 'layout',
        name: 'Layout',
        quantity: 1,
        cw: 160,
        ch: 100,
        scale: 8,
        grid: 1,
        showGrid: true,
        pieceFillOpacity: 1,
        slabCW: 160,
        slabCH: 100,
        areas: [{ id: 'area', name: 'Area' }],
        activeAreaId: 'area',
        pieces: [
          {
            id: 'piece',
            name: 'Piece',
            areaId: 'area',
            x: 10,
            y: 10,
            w: 20,
            h: 10,
            rotation: 0,
            layer: 1,
            color: '#ffffff',
            slabPlacement: { x: 10, y: 60, rotation: 0 },
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
      pieceSnap: false,
      gridSnap: false,
      slabCutClearance: 0.25,
      showGrid: true,
      showDims: true,
      dimPrecision: 16,
      dimFormat: 'fraction',
    },
    active: 0,
  });
  const store = new AppStore(state);
  const commands = new CommandDispatcher(store);
  return new PieceInteractionController(store, commands);
}

describe('piece interaction drag thresholds', () => {
  it('keeps the DESIGN move threshold at four screen pixels', () => {
    const controller = setup('design');
    expect(controller.beginPiece('piece', pointer(15, 15))).toBe(true);

    expect(controller.pointerMove(pointer(15.5, 15))).toBe(true);
    expect(controller.getPreview()).toBeNull();

    expect(controller.pointerMove(pointer(15.501, 15))).toBe(true);
    expect(controller.getPreview()?.kind).toBe('move');
  });

  it('keeps the SLAB move threshold at two screen pixels', () => {
    const controller = setup('slab');
    expect(controller.beginPiece('piece', pointer(15, 65))).toBe(true);

    expect(controller.pointerMove(pointer(15.25, 65))).toBe(true);
    expect(controller.getPreview()).toBeNull();

    expect(controller.pointerMove(pointer(15.251, 65))).toBe(true);
    expect(controller.getPreview()?.kind).toBe('move');
  });
});
