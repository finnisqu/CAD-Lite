import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  preparePieceRectangleShapeEdit,
  transformPieces,
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

async function multiNotchPiece(): Promise<Piece> {
  let piece = rectanglePiece();
  const edits = [
    { id: 'top-left', rect: { x: 8, y: -5, w: 10, h: 15 } },
    { id: 'top-right', rect: { x: 34, y: -5, w: 10, h: 15 } },
    { id: 'bottom-left', rect: { x: 18, y: 20, w: 12, h: 15 } },
    { id: 'bottom-right', rect: { x: 44, y: 20, w: 10, h: 15 } },
  ];

  for (const edit of edits) {
    const result = await preparePieceRectangleShapeEdit(
      testLayout(piece),
      piece.id,
      edit.rect,
      'subtract',
      edit.id,
    );
    if (!result.ok) throw new Error(result.reason);
    piece = result.prepared.piece;
  }
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
