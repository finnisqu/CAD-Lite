import { describe, expect, it } from 'vitest';

import { canvasAddPieceShortcut } from '../src/browser/canvas-keyboard-surface';

describe('canvas Add Piece keyboard parity', () => {
  it('recognizes P case-insensitively', () => {
    expect(canvasAddPieceShortcut('p')).toBe(true);
    expect(canvasAddPieceShortcut('P')).toBe(true);
  });

  it('does not claim unrelated editor keys', () => {
    expect(canvasAddPieceShortcut('d')).toBe(false);
    expect(canvasAddPieceShortcut('n')).toBe(false);
    expect(canvasAddPieceShortcut('q')).toBe(false);
  });
});
