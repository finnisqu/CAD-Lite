import { describe, expect, it } from 'vitest';

import {
  applyPreparedPieceShapeEdit,
  preparePieceRectangleShapeEdit,
  preparePieceShapeModifierDelete,
  preparePieceShapeModifierUpdate,
} from '../src/app';
import {
  pieceFabricationOutline,
  pieceShapeModifiers,
  type Piece,
} from '../src/domain/pieces';
import {
  projectPieceForCanvas,
  type PieceCanvasProjection,
  type PieceCanvasRenderOptions,
} from '../src/browser/piece-canvas-model';
import {
  pieceShapeSnapTargets,
  resolvePieceShapeSnapPoint,
} from '../src/browser/piece-shape-edit-surface';
import { normalizePieces } from '../src/persistence/pieces';
import { applicationStateFromLegacyPayload } from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function rectanglePiece(overrides: Partial<Piece> = {}): Piece {
  const [piece] = normalizePieces(
    [
      {
        id: 'shape-recipe-piece',
        name: 'Shape Recipe Piece',
        areaId: 'area-1',
        x: 10,
        y: 20,
        w: 40,
        h: 25,
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

function polygonArea(points: readonly { x: number; y: number }[]): number {
  let value = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (current && next) value += current.x * next.y - next.x * current.y;
  }
  return Math.abs(value) / 2;
}

const renderOptions: PieceCanvasRenderOptions = {
  showPieceFills: true,
  pieceFillOpacity: 1,
  showSeams: true,
  showSinkCenterlines: true,
  showCutoutLabels: true,
};

describe('persistent Piece shape modifiers', () => {
  it('stores an ADD as an editable modifier while rendering one derived perimeter', async () => {
    const piece = rectanglePiece();
    const result = await preparePieceRectangleShapeEdit(
      testLayout(piece),
      piece.id,
      { x: 40, y: 10, w: 20, h: 15 },
      'add',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = result.prepared.piece;
    const modifiers = pieceShapeModifiers(next);
    expect(modifiers).toHaveLength(1);
    expect(modifiers[0]).toMatchObject({ operation: 'add', x: 40, y: 10, w: 20, h: 15 });
    expect(polygonArea(pieceFabricationOutline(next))).toBeCloseTo(1300, 4);
  });

  it('replays the recipe when an existing modifier is edited', async () => {
    const piece = rectanglePiece();
    const added = await preparePieceRectangleShapeEdit(
      testLayout(piece),
      piece.id,
      { x: 40, y: 10, w: 20, h: 15 },
      'add',
      'addition-1',
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const edited = await preparePieceShapeModifierUpdate(
      testLayout(added.prepared.piece),
      piece.id,
      'addition-1',
      { w: 10 },
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(pieceShapeModifiers(edited.prepared.piece)[0]?.w).toBe(10);
    expect(polygonArea(pieceFabricationOutline(edited.prepared.piece))).toBeCloseTo(1150, 4);
  });

  it('removes a modifier and rebuilds the original base Piece', async () => {
    const piece = rectanglePiece();
    const added = await preparePieceRectangleShapeEdit(
      testLayout(piece),
      piece.id,
      { x: 40, y: 10, w: 20, h: 15 },
      'add',
      'addition-1',
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const removed = await preparePieceShapeModifierDelete(
      testLayout(added.prepared.piece),
      piece.id,
      'addition-1',
    );
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(pieceShapeModifiers(removed.prepared.piece)).toHaveLength(0);
    expect(removed.prepared.piece.w).toBe(40);
    expect(removed.prepared.piece.h).toBe(25);
    expect(polygonArea(pieceFabricationOutline(removed.prepared.piece))).toBeCloseTo(1000, 4);
  });

  it('promotes an older flattened experimental Piece as the recipe base', async () => {
    const source = rectanglePiece({
      fabricationShape: {
        kind: 'polygon',
        frameWidth: 40,
        frameHeight: 25,
        outer: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 10 },
          { x: 20, y: 10 },
          { x: 20, y: 25 },
          { x: 0, y: 25 },
        ],
      },
    });
    const result = await preparePieceRectangleShapeEdit(
      testLayout(source),
      source.id,
      { x: 20, y: 10, w: 10, h: 10 },
      'add',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pieceShapeModifiers(result.prepared.piece)).toHaveLength(1);
    expect(polygonArea(pieceFabricationOutline(result.prepared.piece))).toBeGreaterThan(700);
  });
});

describe('Piece shape polygon snapping', () => {
  function projectionFor(piece: Piece): PieceCanvasProjection {
    const item = projectPieceForCanvas(piece, 'design', renderOptions, 0, null, true);
    return {
      layoutId: 'layout-1',
      workspace: 'design',
      scale: 2,
      canvas: { width: 200, height: 200 },
      slabs: [],
      pieces: [item],
    };
  }

  it('publishes actual perimeter vertices and edge midpoints as sticky targets', () => {
    const piece = rectanglePiece();
    const projection = projectionFor(piece);
    const targets = pieceShapeSnapTargets(projection, piece.id);
    expect(targets.filter((target) => target.kind === 'vertex')).toHaveLength(4);
    expect(targets.filter((target) => target.kind === 'midpoint')).toHaveLength(4);
  });

  it('prefers a Piece vertex over the grid when both are nearby', () => {
    const piece = rectanglePiece();
    const projection = projectionFor(piece);
    const vertex = pieceShapeSnapTargets(projection, piece.id).find(
      (target) => target.kind === 'vertex',
    );
    if (!vertex) throw new Error('Expected vertex target.');
    const result = resolvePieceShapeSnapPoint(
      projection,
      piece.id,
      { x: vertex.point.x + 1, y: vertex.point.y + 1 },
      {
        scale: projection.scale,
        pieceSnap: true,
        gridSnap: true,
        gridStep: 6,
      },
    );
    expect(result.target?.kind).toBe('vertex');
    expect(result.point).toEqual(vertex.point);
  });
});
