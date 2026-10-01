import { describe, expect, it } from 'vitest';

import { canvasHistoryShortcut } from '../src/browser/canvas-keyboard-surface';

describe('canvas history keyboard parity', () => {
  it('maps Ctrl/Cmd+Z without Shift to Undo', () => {
    expect(canvasHistoryShortcut('z', false)).toBe('undo');
    expect(canvasHistoryShortcut('Z', false)).toBe('undo');
  });

  it('maps Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z to Redo', () => {
    expect(canvasHistoryShortcut('y', false)).toBe('redo');
    expect(canvasHistoryShortcut('Y', true)).toBe('redo');
    expect(canvasHistoryShortcut('z', true)).toBe('redo');
  });

  it('leaves unrelated command keys to the rest of the canvas shortcut layer', () => {
    expect(canvasHistoryShortcut('c', false)).toBeNull();
    expect(canvasHistoryShortcut('d', true)).toBeNull();
  });
});
