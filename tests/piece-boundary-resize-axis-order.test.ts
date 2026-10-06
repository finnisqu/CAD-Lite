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

function basePiece(): Piece {
  const [piece] = normalizePieces(
    [
      {
        id: 'axis-order-piece',
        name: 'Axis Order Piece',
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
  if (!piece) throw new Error('Expected Piece.');
  return piece;
}

function layoutWithPiece(piece: Piece) {
  const state = applicationStateFromLegacyPayload(v159ProjectFixture);
  const source = state.project.layouts[0];
  if (!source) throw new Error('Expected Layout.');
  return { ...source, pieces: [piece] };
}

async function edit(
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
  if (!result.ok) throw new Error(`${id}: ${result.reason}`);
  return result.prepared.piece;
}

function uniqueY(piece: Piece): number[] {
  return [...new Set(pieceFabricationOutline(piece).map((point) => point.y))]
    .sort((a, b) => a - b);
}

describe('height-first mixed modifier boundary resize', () => {
  it('does not stretch after ADD-bottom, SUBTRACT-bottom, ADD-right', async () => {
    let piece = basePiece();

    // First operation expands only the vertical frame.
    piece = await edit(
      piece,
      'add',
      { x: 12, y: piece.h - 5, w: 18, h: 15 },
      'add-bottom',
    );

    // Then carve a perimeter notch through that taller bottom edge.
    piece = await edit(
      piece,
      'subtract',
      { x: 20, y: piece.h - 12, w: 10, h: 20 },
      'subtract-bottom',
    );

    // Last operation expands only the horizontal frame.
    piece = await edit(
      piece,
      'add',
      { x: piece.w - 5, y: 8, w: 15, h: 10 },
      'add-right',
    );

    expect(pieceShapeModifiers(piece).map((modifier) => modifier.operation)).toEqual([
      'add',
      'subtract',
      'add',
    ]);

    const beforeY = uniqueY(piece);
    const unchangedInterior = beforeY.filter(
      (value) => value > 0 && value < piece.h - 6,
    );
    expect(unchangedInterior.length).toBeGreaterThan(2);

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

    const x = piece.x + piece.w / 2;
    const y = piece.y + piece.h;
    expect(interaction.beginResize(piece.id, 'bottom', pointer(x, y))).toBe(true);
    expect(interaction.pointerMove(pointer(x, y - 6))).toBe(true);
    expect(interaction.pointerUp(pointer(x, y - 6, 0))).toBe(true);

    const resized = store.getState().project.layouts[0]?.pieces[0];
    if (!resized) throw new Error('Expected resized Piece.');
    const afterY = uniqueY(resized);

    expect(resized.y).toBe(piece.y);
    expect(resized.h).toBe(piece.h - 6);
    expect(Math.max(...afterY)).toBe(piece.h - 6);
    unchangedInterior.forEach((value) => expect(afterY).toContain(value));
  });
});
