import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applyPreparedPieceShapeEdit,
  applicationStateFromLegacyPayload,
  preparePieceRectangleShapeEdit,
} from '../src/app';
import {
  pieceFabricationOutline,
  pieceGeometry,
  piecePose,
  type Piece,
} from '../src/domain/pieces';
import {
  rotatePointAround,
  rotatedRectBoundingSize,
} from '../src/geometry';
import { normalizePieces } from '../src/persistence/pieces';
import {
  pieceShapeCanvasPoint,
  pieceShapeLocalPoint,
  pieceShapeRectangleFromDrag,
} from '../src/browser/piece-shape-edit-surface';
import { v159ProjectFixture } from './fixtures/v159-project';

function rectanglePiece(overrides: Partial<Piece> = {}): Piece {
  const [piece] = normalizePieces(
    [
      {
        id: 'shape-piece',
        name: 'Shape Piece',
        areaId: 'area-1',
        x: 10,
        y: 20,
        w: 40,
        h: 25,
        rotation: 0,
        slabPlacement: { x: 30, y: 40, rotation: 0 },
      },
    ],
    ['area-1'],
    'piece',
  );
  if (!piece) throw new Error('Expected normalized Piece.');
  return { ...piece, ...overrides };
}

function testLayout(piece: Piece) {
  const state = applicationStateFromLegacyPayload(v159ProjectFixture);
  const source = state.project.layouts[0];
  if (!source) throw new Error('Expected fixture Layout.');
  return { ...source, pieces: [piece] };
}

function area(points: readonly { x: number; y: number }[]): number {
  let value = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (current && next) value += current.x * next.y - next.x * current.y;
  }
  return Math.abs(value) / 2;
}

function localPointToWorld(piece: Piece, point: { x: number; y: number }) {
  const geometry = pieceGeometry(piece);
  const pose = piecePose(piece, 'design');
  const bounds = rotatedRectBoundingSize({
    w: geometry.width,
    h: geometry.height,
    rotation: pose.rotation,
  });
  const center = {
    x: pose.x + bounds.w / 2,
    y: pose.y + bounds.h / 2,
  };
  const unrotated = {
    x: center.x - geometry.width / 2 + point.x,
    y: center.y - geometry.height / 2 + point.y,
  };
  return rotatePointAround(unrotated, center, pose.rotation);
}

describe('rectangular Piece shape editing', () => {
  it('unions a touching rectangle into one L-shaped Piece and expands its frame', async () => {
    const piece = rectanglePiece();
    const result = await preparePieceRectangleShapeEdit(
      testLayout(piece),
      piece.id,
      { x: 40, y: 10, w: 20, h: 15 },
      'add',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prepared.piece.w).toBe(60);
    expect(result.prepared.piece.h).toBe(25);
    expect(result.prepared.piece.x).toBe(10);
    expect(area(pieceFabricationOutline(result.prepared.piece))).toBeCloseTo(1300, 4);
    expect(result.prepared.piece.fabricationShape?.outer.length).toBeGreaterThan(4);
  });

  it('subtracts a perimeter rectangle to create a notch', async () => {
    const piece = rectanglePiece();
    const result = await preparePieceRectangleShapeEdit(
      testLayout(piece),
      piece.id,
      { x: 30, y: 0, w: 10, h: 10 },
      'subtract',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prepared.piece.w).toBe(40);
    expect(result.prepared.piece.h).toBe(25);
    expect(area(pieceFabricationOutline(result.prepared.piece))).toBeCloseTo(900, 4);
  });

  it('rejects an interior subtraction because holes stay semantic cutouts', async () => {
    const piece = rectanglePiece();
    const result = await preparePieceRectangleShapeEdit(
      testLayout(piece),
      piece.id,
      { x: 10, y: 5, w: 10, h: 10 },
      'subtract',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('Cutout');
  });

  it('rejects a subtraction that splits the Piece into separate islands', async () => {
    const piece = rectanglePiece();
    const result = await preparePieceRectangleShapeEdit(
      testLayout(piece),
      piece.id,
      { x: 15, y: -1, w: 10, h: 27 },
      'subtract',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('separate islands');
  });

  it('rejects a disjoint ADD rectangle', async () => {
    const piece = rectanglePiece();
    const result = await preparePieceRectangleShapeEdit(
      testLayout(piece),
      piece.id,
      { x: 50, y: 0, w: 10, h: 10 },
      'add',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('touch or overlap');
  });

  it('preserves existing world geometry when ADD expands the frame leftward', async () => {
    const piece = rectanglePiece({ rotation: 30 });
    const oldWorldOrigin = localPointToWorld(piece, { x: 0, y: 0 });
    const result = await preparePieceRectangleShapeEdit(
      testLayout(piece),
      piece.id,
      { x: -10, y: 0, w: 10, h: 10 },
      'add',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = result.prepared.piece;
    const sameWorldPoint = localPointToWorld(next, { x: 10, y: 0 });
    expect(sameWorldPoint.x).toBeCloseTo(oldWorldOrigin.x, 3);
    expect(sameWorldPoint.y).toBeCloseTo(oldWorldOrigin.y, 3);
  });

  it('shifts semantic child coordinates when the frame origin moves', async () => {
    const source = rectanglePiece();
    const piece: Piece = {
      ...source,
      cutouts: [
        {
          id: 'cutout-1', name: 'Cutout', kind: 'rectangle',
          cx: 20, cy: 12, w: 4, h: 4, diameter: null,
          cornerR: 0, rotation: 0, insideFinish: 'unpolished',
          fabricationSplitCutoutId: null,
        },
      ],
      pieceSeams: [
        { id: 'seam-1', orientation: 'vertical', reference: 'left', offset: 20 },
      ],
    };
    const result = await preparePieceRectangleShapeEdit(
      testLayout(piece),
      piece.id,
      { x: -10, y: 0, w: 10, h: 10 },
      'add',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prepared.piece.cutouts[0]?.cx).toBe(30);
    expect(result.prepared.piece.pieceSeams[0]?.offset).toBe(30);
  });

  it('applies only to the Piece snapshot that was prepared', async () => {
    const state = applicationStateFromLegacyPayload(v159ProjectFixture);
    const layout = state.project.layouts[0];
    if (!layout) throw new Error('Expected fixture Layout.');
    const piece = rectanglePiece({ areaId: layout.areas[0]?.id ?? '' });
    const workingLayout = { ...layout, pieces: [piece] };
    const workingState = {
      ...state,
      project: {
        ...state.project,
        layouts: state.project.layouts.map((candidate, index) =>
          index === 0 ? workingLayout : candidate),
      },
      session: { ...state.session, activeLayoutId: workingLayout.id },
    };
    const prepared = await preparePieceRectangleShapeEdit(
      workingLayout,
      piece.id,
      { x: 40, y: 0, w: 10, h: 10 },
      'add',
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const store = new AppStore(workingState);
    const commands = new CommandDispatcher(store);
    expect(commands.execute(applyPreparedPieceShapeEdit(prepared.prepared))).not.toBeNull();
    expect(store.getState().project.layouts[0]?.pieces[0]?.w).toBe(50);

    expect(commands.execute(applyPreparedPieceShapeEdit(prepared.prepared))).toBeNull();
  });
});

describe('Piece shape edit canvas helpers', () => {
  it('normalizes reverse-direction rectangle drags', () => {
    expect(pieceShapeRectangleFromDrag({ x: 12, y: 9 }, { x: 3, y: 2 })).toEqual({
      x: 3,
      y: 2,
      w: 9,
      h: 7,
    });
  });

  it('round-trips Piece-local points through a rotated canvas frame', () => {
    const piece = {
      center: { x: 50, y: 40 },
      localRect: { x: 30, y: 27.5, w: 40, h: 25 },
      renderRotation: 30,
    };
    const local = { x: 7.25, y: 11.5 };
    const canvas = pieceShapeCanvasPoint(piece, local);
    const roundTrip = pieceShapeLocalPoint(piece, canvas);
    expect(roundTrip.x).toBeCloseTo(local.x, 8);
    expect(roundTrip.y).toBeCloseTo(local.y, 8);
  });
});
