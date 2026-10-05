import { describe, expect, it } from 'vitest';

import {
  dragPieceShapeModifier,
  nudgePieceShapeModifier,
} from '../src/browser/piece-shape-modifier-interaction';

const source = { x: 10, y: 5, w: 20, h: 12 };

describe('Piece shape modifier direct manipulation geometry', () => {
  it('moves the modifier without changing its size', () => {
    expect(dragPieceShapeModifier(source, 'move', 4.25, -1.5)).toEqual({
      x: 14.25,
      y: 3.5,
      w: 20,
      h: 12,
    });
  });

  it('resizes individual edges and corners from the dragged side', () => {
    expect(dragPieceShapeModifier(source, 'e', 3, 99)).toEqual({
      x: 10,
      y: 5,
      w: 23,
      h: 12,
    });
    expect(dragPieceShapeModifier(source, 'nw', -2, -3)).toEqual({
      x: 8,
      y: 2,
      w: 22,
      h: 15,
    });
    expect(dragPieceShapeModifier(source, 'se', 2.5, 4)).toEqual({
      x: 10,
      y: 5,
      w: 22.5,
      h: 16,
    });
  });

  it('does not invert a modifier when a handle crosses its opposite edge', () => {
    expect(dragPieceShapeModifier(source, 'w', 50, 0)).toEqual({
      x: 29.875,
      y: 5,
      w: 0.125,
      h: 12,
    });
    expect(dragPieceShapeModifier(source, 'n', 0, 50)).toEqual({
      x: 10,
      y: 16.875,
      w: 20,
      h: 0.125,
    });
  });

  it('nudges in precise fractional increments', () => {
    expect(nudgePieceShapeModifier(source, -0.125, 1)).toEqual({
      x: 9.875,
      y: 6,
      w: 20,
      h: 12,
    });
  });
});
