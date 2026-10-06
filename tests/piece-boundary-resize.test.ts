import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  PieceInteractionController,
  applicationStateFromLegacyPayload,
  preparePieceRectangleShapeEdit,
  transformPieces,
  type ToolPointerInput,
} from '../src/app';
import {
  inferPieceBoundaryResizeSide,
  pieceBoundaryResizeOutline,
  pieceFabricationOutline,
  pieceGeometry,
  pieceShapeModifiers,
  type Piece,
} from '../src/domain/pieces';
import {
  projectPieceForCanvas,
  type PieceCanvasRenderOptions,
} from '../src/browser/piece-canvas-model';
import { normalizePieces } from '../src/persistence/pieces';
import { v159ProjectFixture } from './fixtures/v159-project';

const renderOptions: PieceCanvasRenderOptions = {
  showPieceFills: true,
  pieceFillOpacity: 1,
  showSeams: true,
  showSinkCenterlines: true,
  showCutoutLabels: true,
};

function pointer(x: number, y: number, buttons = 1): ToolPointerInput {
  return {
    pointerId: 1,
    x,
    y,
    button: 0,
    buttons,
    modifiers: {
      shift: false,
      alt: true,
      ctrl: false,
      meta: false,
    },
  };
}

function rectanglePiece(): Piece {
  const [piece] = normalizePieces(
    [
      {
        id: 'boundary-resize-piece',
        name: 'Boundary Resize Piece',
        areaId: 'area-1',
        x: 50,
        y: 30,
        w: 60,
        h: 30,
      },
    ],
    ['area-1'],
    'piece',
  );
  if (!piece) throw new Error('Expected normalized Piece.');
  return piece;
}

function testLayout(piece: Piece) {
  const state = applicationStateFromLegacyPayload(v159ProjectFixture);
  const source = state.project.layouts[0];
  if (!source) throw new Error('Expected fixture Layout.');
  return { ...source, pieces: [piece] };
}

async function edit(
  piece: Piece,
  operation: 'add' | 'subtract',
  rect: { x: number; y: number; w: number; h: number },
  id: string,
): Promise<Piece> {
  const result = await preparePieceRectangleShapeEdit(
    testLayout(piece),
    piece.id,
    rect,
    operation,
    id,
  );
  if (!result.ok) throw new Error(`${id}: ${result.reason}`);
  return result.prepared.piece;
}

async function multiNotchPiece(): Promise<Piece> {
  let piece = rectanglePiece();
  const edits = [
    { id: 'top-left', rect: { x: 8, y: -5, w: 10, h: 15 } },
    { id: 'top-right', rect: { x: 34, y: -5, w: 10, h: 15 } },
    { id: 'bottom-left', rect: { x: 18, y: 20, w: 12, h: 15 } },
    { id: 'bottom-right', rect: { x: 44, y: 20, w: 10, h: 15 } },
  ];

  for (const item of edits) {
    piece = await edit(piece, 'subtract', item.rect, item.id);
  }
  return piece;
}

async function leftProjectionPiece(): Promise<Piece> {
  let piece = rectanglePiece();
  // Leaves a 12-inch-wide upper-left projection, matching the failure where an
  // inward left resize carried a thin remnant after the handle passed it.
  piece = await edit(
    piece,
    'subtract',
    { x: 12, y: -5, w: 30, h: 15 },
    'top-recess',
  );
  piece = await edit(
    piece,
    'subtract',
    { x: 25, y: 20, w: 15, h: 15 },
    'bottom-recess',
  );
  piece = await edit(
    piece,
    'add',
    { x: piece.w - 2, y: 8, w: 12, h: 10 },
    'right-addition',
  );
  return piece;
}

function localXValues(points: readonly { x: number; y: number }[]): number[] {
  return [...new Set(points.map((point) => point.x))].sort((a, b) => a - b);
}

describe('one-boundary Piece resize', () => {
  it('extends the right boundary without stretching existing notches', async () => {
    const piece = await multiNotchPiece();
    const beforeModifiers = pieceShapeModifiers(piece);
    const outline = pieceBoundaryResizeOutline(piece, 'right', 90, piece.h);

    expect(localXValues(outline)).toContain(90);
    expect(localXValues(outline)).toContain(8);
    expect(localXValues(outline)).toContain(18);
    expect(localXValues(outline)).toContain(34);
    expect(localXValues(outline)).toContain(44);

    const preview = projectPieceForCanvas(
      piece,
      'design',
      renderOptions,
      0,
      {
        id: piece.id,
        geometry: {
          ...pieceGeometry(piece),
          width: 90,
        },
        // Right-edge resize leaves the left/top frame origin fixed.
        pose: { x: piece.x, y: piece.y, rotation: piece.rotation },
      },
      true,
    );
    const previewLocal = preview.fabricationOutline.map((point) => ({
      x: point.x - preview.localRect.x,
      y: point.y - preview.localRect.y,
    }));
    expect(localXValues(previewLocal)).toContain(8);
    expect(localXValues(previewLocal)).toContain(18);
    expect(localXValues(previewLocal)).toContain(90);

    const state = applicationStateFromLegacyPayload(v159ProjectFixture);
    const layout = testLayout(piece);
    const store = new AppStore({
      ...state,
      project: { ...state.project, layouts: [layout] },
      session: {
        ...state.session,
        activeLayoutId: layout.id,
        workspace: 'design',
        selection: { kind: 'pieces', ids: [piece.id] },
      },
    });
    const commands = new CommandDispatcher(store);
    commands.execute(
      transformPieces(layout.id, [
        {
          id: piece.id,
          geometry: { ...pieceGeometry(piece), width: 90 },
          designPose: { x: piece.x, y: piece.y, rotation: piece.rotation },
        },
      ]),
    );

    const resized = store.getState().project.layouts[0]?.pieces[0];
    if (!resized) throw new Error('Expected resized Piece.');
    expect(resized.w).toBe(90);
    expect(pieceShapeModifiers(resized)).toEqual(beforeModifiers);
    expect(localXValues(pieceFabricationOutline(resized))).toContain(8);
    expect(localXValues(pieceFabricationOutline(resized))).toContain(18);
    expect(localXValues(pieceFabricationOutline(resized))).toContain(90);
  });

  it('retracts the right boundary inward while keeping the left edge fixed', async () => {
    const piece = await multiNotchPiece();
    const nextWidth = 40;
    const geometry = { ...pieceGeometry(piece), width: nextWidth };
    const resizedPose = {
      x: piece.x,
      y: piece.y,
      rotation: piece.rotation,
    };

    expect(
      inferPieceBoundaryResizeSide(piece, geometry, resizedPose),
    ).toBe('right');

    const preview = projectPieceForCanvas(
      piece,
      'design',
      renderOptions,
      0,
      { id: piece.id, geometry, pose: resizedPose },
      true,
    );
    const previewLocal = preview.fabricationOutline.map((point) => ({
      x: point.x - preview.localRect.x,
      y: point.y - preview.localRect.y,
    }));
    const previewX = localXValues(previewLocal);
    expect(preview.localRect.x).toBe(piece.x);
    expect(Math.max(...previewX)).toBe(nextWidth);
    expect(previewX).toContain(8);
    expect(previewX).toContain(18);
    expect(previewX).toContain(34);
    expect(previewX).not.toContain(44);

    const state = applicationStateFromLegacyPayload(v159ProjectFixture);
    const layout = testLayout(piece);
    const store = new AppStore({
      ...state,
      project: { ...state.project, layouts: [layout] },
      session: {
        ...state.session,
        activeLayoutId: layout.id,
        workspace: 'design',
        selection: { kind: 'pieces', ids: [piece.id] },
      },
    });
    const commands = new CommandDispatcher(store);
    commands.execute(
      transformPieces(layout.id, [
        { id: piece.id, geometry, designPose: resizedPose },
      ]),
    );

    const resized = store.getState().project.layouts[0]?.pieces[0];
    if (!resized) throw new Error('Expected resized Piece.');
    const resizedX = localXValues(pieceFabricationOutline(resized));
    expect(resized.x).toBe(piece.x);
    expect(resized.w).toBe(nextWidth);
    expect(Math.max(...resizedX)).toBe(nextWidth);
    expect(resizedX).toContain(8);
    expect(resizedX).toContain(18);
    expect(resizedX).toContain(34);
    expect(resizedX).not.toContain(44);
  });

  it('erases an upper-left projection once an inward left handle passes it', async () => {
    const piece = await leftProjectionPiece();
    const originalWidth = piece.w;
    const cut = 18;
    const state = applicationStateFromLegacyPayload(v159ProjectFixture);
    const layout = testLayout(piece);
    const store = new AppStore({
      ...state,
      project: { ...state.project, layouts: [layout] },
      session: {
        ...state.session,
        activeLayoutId: layout.id,
        workspace: 'design',
        selection: { kind: 'pieces', ids: [piece.id] },
      },
    });
    const commands = new CommandDispatcher(store);
    const interaction = new PieceInteractionController(store, commands);
    const startX = piece.x;
    const startY = piece.y + piece.h / 2;

    expect(
      interaction.beginResize(piece.id, 'left', pointer(startX, startY)),
    ).toBe(true);
    expect(
      interaction.pointerMove(pointer(startX + cut, startY)),
    ).toBe(true);

    const previewItem = interaction.getPreview()?.pieces[0];
    if (!previewItem?.geometry) throw new Error('Expected left-resize preview.');
    const previewProjected = projectPieceForCanvas(
      piece,
      'design',
      renderOptions,
      0,
      {
        id: piece.id,
        geometry: previewItem.geometry,
        pose: previewItem.pose,
      },
      true,
    );
    const previewLocal = previewProjected.fabricationOutline.map((point) => ({
      x: point.x - previewProjected.localRect.x,
      y: point.y - previewProjected.localRect.y,
    }));
    const previewLeftYs = previewLocal
      .filter((point) => Math.abs(point.x) <= 0.001)
      .map((point) => point.y);
    expect(previewLeftYs.length).toBeGreaterThan(0);
    expect(Math.min(...previewLeftYs)).toBe(10);
    expect(
      previewLocal.some(
        (point) => Math.abs(point.x) <= 0.001 && Math.abs(point.y) <= 0.001,
      ),
    ).toBe(false);

    expect(
      interaction.pointerUp(pointer(startX + cut, startY, 0)),
    ).toBe(true);
    const resized = store.getState().project.layouts[0]?.pieces[0];
    if (!resized) throw new Error('Expected resized Piece.');
    const outline = pieceFabricationOutline(resized);
    const leftYs = outline
      .filter((point) => Math.abs(point.x) <= 0.001)
      .map((point) => point.y);

    expect(resized.x).toBe(piece.x + cut);
    expect(resized.w).toBe(originalWidth - cut);
    expect(leftYs.length).toBeGreaterThan(0);
    expect(Math.min(...leftYs)).toBe(10);
    expect(
      outline.some(
        (point) => Math.abs(point.x) <= 0.001 && Math.abs(point.y) <= 0.001,
      ),
    ).toBe(false);
    expect(pieceShapeModifiers(resized).map((modifier) => modifier.operation)).toEqual([
      'subtract',
      'subtract',
      'add',
    ]);
  });

  it('keeps the dominant bottom resize axis authoritative despite tiny cross-axis noise', () => {
    const piece = rectanglePiece();
    const geometry = {
      ...pieceGeometry(piece),
      width: piece.w + 0.02,
      height: piece.h - 6,
    };
    const pose = {
      x: piece.x,
      y: piece.y,
      // Equivalent rotation should not invalidate one-boundary inference.
      rotation: piece.rotation + 360,
    };

    expect(inferPieceBoundaryResizeSide(piece, geometry, pose)).toBe('bottom');
  });

  it('extends the left boundary while keeping interior notch geometry fixed in world space', async () => {
    const piece = await multiNotchPiece();
    const delta = 20;
    const nextWidth = piece.w + delta;
    const oldModifiers = pieceShapeModifiers(piece);
    const geometry = { ...pieceGeometry(piece), width: nextWidth };
    const resizedPose = {
      x: piece.x - delta,
      y: piece.y,
      rotation: piece.rotation,
    };

    const preview = projectPieceForCanvas(
      piece,
      'design',
      renderOptions,
      0,
      { id: piece.id, geometry, pose: resizedPose },
      true,
    );
    const topLeftWorldBefore = piece.x + (oldModifiers[0]?.x ?? 0);
    const previewLocal = preview.fabricationOutline.map((point) => ({
      x: point.x - preview.localRect.x,
      y: point.y - preview.localRect.y,
    }));
    expect(localXValues(previewLocal)).toContain(8 + delta);
    expect(preview.localRect.x + 8 + delta).toBe(topLeftWorldBefore);

    const state = applicationStateFromLegacyPayload(v159ProjectFixture);
    const layout = testLayout(piece);
    const store = new AppStore({
      ...state,
      project: { ...state.project, layouts: [layout] },
      session: {
        ...state.session,
        activeLayoutId: layout.id,
        workspace: 'design',
        selection: { kind: 'pieces', ids: [piece.id] },
      },
    });
    const commands = new CommandDispatcher(store);
    commands.execute(
      transformPieces(layout.id, [
        { id: piece.id, geometry, designPose: resizedPose },
      ]),
    );

    const resized = store.getState().project.layouts[0]?.pieces[0];
    if (!resized) throw new Error('Expected resized Piece.');
    const modifiers = pieceShapeModifiers(resized);
    expect(modifiers[0]?.x).toBe((oldModifiers[0]?.x ?? 0) + delta);
    expect(modifiers[0]?.w).toBe(oldModifiers[0]?.w);
    expect(resized.x + (modifiers[0]?.x ?? 0)).toBe(topLeftWorldBefore);
  });
});
