import { describe, expect, it } from 'vitest';

import {
  createDefaultSink,
  pieceFabricationOutline,
  pieceFabricationRegions,
  type Piece,
} from '../src/domain/pieces';
import { normalizePieces } from '../src/persistence/pieces';

function polygonArea(points: readonly { x: number; y: number }[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (current && next) area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function lShapePiece(overrides: Partial<Piece> = {}): Piece {
  const [piece] = normalizePieces(
    [
      {
        id: 'piece-1',
        name: 'L Piece',
        areaId: 'area-1',
        x: 10,
        y: 10,
        w: 40,
        h: 25.5,
        fabricationShape: {
          kind: 'polygon',
          frameWidth: 40,
          frameHeight: 25.5,
          outer: [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 10 },
            { x: 20, y: 10 },
            { x: 20, y: 25.5 },
            { x: 0, y: 25.5 },
          ],
        },
      },
    ],
    ['area-1'],
    'piece',
  );
  if (!piece) throw new Error('Expected normalized Piece.');
  return { ...piece, ...overrides };
}

describe('polygonal Piece fabrication shape', () => {
  it('persists a custom L-shaped boundary separately from the editing frame', () => {
    const piece = lShapePiece();
    expect(piece.fabricationShape?.kind).toBe('polygon');
    expect(piece.fabricationShape?.outer).toHaveLength(6);
    expect(polygonArea(pieceFabricationOutline(piece))).toBeCloseTo(710, 6);
  });

  it('scales an authored fabrication polygon with the mature Piece resize frame', () => {
    const piece = lShapePiece({ w: 80, h: 51 });
    const outline = pieceFabricationOutline(piece);

    expect(outline).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 51 },
      { x: 0, y: 51 },
    ]);
  });

  it('preserves the authored source frame when a resized Piece is reloaded', () => {
    const [piece] = normalizePieces(
      [
        {
          id: 'piece-resized',
          areaId: 'area-1',
          w: 80,
          h: 51,
          fabricationShape: {
            kind: 'polygon',
            frameWidth: 40,
            frameHeight: 25.5,
            outer: [
              { x: 0, y: 0 },
              { x: 40, y: 0 },
              { x: 40, y: 10 },
              { x: 20, y: 10 },
              { x: 20, y: 25.5 },
              { x: 0, y: 25.5 },
            ],
          },
        },
      ],
      ['area-1'],
      'piece',
    );
    if (!piece) throw new Error('Expected normalized Piece.');

    expect(piece.fabricationShape?.frameWidth).toBe(40);
    expect(piece.fabricationShape?.frameHeight).toBe(25.5);
    expect(pieceFabricationOutline(piece)[2]).toEqual({ x: 80, y: 20 });
  });

  it('subtracts semantic sink geometry from the polygon through Clipper', async () => {
    const sink = createDefaultSink('sink-1');
    if (!sink) throw new Error('Expected default sink.');
    const piece = lShapePiece({
      sinks: [
        {
          ...sink,
          shape: 'rect',
          w: 10,
          h: 8,
          cornerR: 1,
          side: 'front',
          centerline: 10,
          setback: 5,
          faucets: [],
        },
      ],
    });

    const regions = await pieceFabricationRegions(piece);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.outer.length).toBeGreaterThanOrEqual(6);
    expect(regions[0]?.holes).toHaveLength(1);
    expect(polygonArea(regions[0]?.holes[0] ?? [])).toBeGreaterThan(70);
  });
});
