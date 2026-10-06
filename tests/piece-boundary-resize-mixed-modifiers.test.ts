import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  PieceInteractionController,
  applicationStateFromLegacyPayload,
  preparePieceRectangleShapeEdit,
  type ToolPointerInput,
} from '../src/app';
import {
  pieceFabricationOutline,
  pieceShapeModifiers,
  type Piece,
} from '../src/domain/pieces';
import { normalizePieces } from '../src/persistence/pieces';
import { v159ProjectFixture } from './fixtures/v159-project';

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

function rectanglePiece(): Piece {
  const [piece] = normalizePieces(
    [
      {
        id: 'mixed-resize-piece',
        name: 'Mixed Resize Piece',
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

function layoutWithPiece(piece: Piece) {
  const state = applicationStateFromLegacyPayload(v159ProjectFixture);
  const source = state.project.layouts[0];
  if (!source) throw new Error('Expected fixture Layout.');
  return { ...source, pieces: [piece] };
}

async function applyRectangle(
  piece: Piece,
  operation: 'add' | 'subtract',
  rect: { x: number; y: number; w: number; h: number },
  id: string,
): Promise<Piece> {
  const result = await preparePieceRectangleShapeEdit(
    layoutWithPiece(piece),
    piece.id,
    rect,
    operation,
    id,
  );
  if (!result.ok) {
    throw new Error(`${id}: ${result.reason}`);
  }
  return result.prepared.piece;
}

async function addSubtractAddPiece(): Promise<Piece> {
  let piece = rectanglePiece();

  // Expand the right side while retaining a large overlap with the base Piece.
  piece = await applyRectangle(
    piece,
    'add',
    { x: piece.w - 5, y: 8, w: 15, h: 10 },
    'add-right',
  );

  // Open a notch through the current bottom perimeter.
  piece = await applyRectangle(
    piece,
    'subtract',
    { x: 24, y: piece.h - 8, w: 14, h: 16 },
    'subtract-bottom',
  );

  // Expand the bottom from an unquestionably solid portion of the current Piece.
  piece = await applyRectangle(
    piece,
    'add',
    { x: 8, y: piece.h - 5, w: 12, h: 15 },
    'add-bottom',
  );

  return piece;
}

function uniqueY(piece: Piece): number[] {
  return [
    ...new Set(pieceFabricationOutline(piece).map((point) => point.y)),
  ].sort((a, b) => a - b);
}

describe('mixed modifier Piece boundary resize', () => {
  it('keeps ADD-SUBTRACT-ADD geometry rigid when the bottom handle retracts', async () => {
    const piece = await addSubtractAddPiece();
    expect(pieceShapeModifiers(piece).map((modifier) => modifier.operation)).toEqual([
      'add',
      'subtract',
      'add',
    ]);

    const beforeY = uniqueY(piece);
    expect(beforeY).toContain(8);
    expect(beforeY).toContain(22);
    expect(beforeY).toContain(25);
    expect(beforeY).toContain(30);
    expect(Math.max(...beforeY)).toBe(piece.h);

    const state = applicationStateFromLegacyPayload(v159ProjectFixture);
    const layout = layoutWithPiece(piece);
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

    const startX = piece.x + piece.w / 2;
    const startY = piece.y + piece.h;
    expect(
      interaction.beginResize(
        piece.id,
        'bottom',
        pointer(startX, startY),
      ),
    ).toBe(true);

    const retract = 6;
    expect(
      interaction.pointerMove(
        pointer(startX, startY - retract, {
          modifiers: { shift: false, alt: true, ctrl: false, meta: false },
        }),
      ),
    ).toBe(true);

    const preview = interaction.getPreview();
    const item = preview?.pieces[0];
    if (!item?.geometry) throw new Error('Expected bottom resize preview.');
    expect(preview?.kind).toBe('resize');
    expect(item.geometry.height).toBe(piece.h - retract);
    expect(item.pose.y).toBe(piece.y);

    expect(
      interaction.pointerUp(
        pointer(startX, startY - retract, { buttons: 0 }),
      ),
    ).toBe(true);

    const resized = store.getState().project.layouts[0]?.pieces[0];
    if (!resized) throw new Error('Expected resized Piece.');
    const afterY = uniqueY(resized);

    // The grabbed bottom edge is the only boundary being erased inward.
    expect(resized.y).toBe(piece.y);
    expect(resized.h).toBe(piece.h - retract);
    expect(Math.max(...afterY)).toBe(piece.h - retract);

    // Interior construction geometry must not rubber-scale with the new height.
    expect(afterY).toContain(8);
    expect(afterY).toContain(22);
    expect(afterY).toContain(25);
    expect(afterY).toContain(30);
  });
});
