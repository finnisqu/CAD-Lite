import { describe, expect, it } from 'vitest';

import {
  nextProductionInspectorSection,
  type ProductionPieceInspectorSection,
} from '../src/browser';

describe('production Inspector accordion state', () => {
  it('opens a requested Piece Inspector section exclusively', () => {
    expect(nextProductionInspectorSection('pieceInfo', 'appearance')).toBe(
      'appearance',
    );
    expect(nextProductionInspectorSection('appearance', 'overhangs')).toBe(
      'overhangs',
    );
    expect(nextProductionInspectorSection('overhangs', 'edgeOptions')).toBe(
      'edgeOptions',
    );
    expect(nextProductionInspectorSection('edgeOptions', 'sinks')).toBe('sinks');
    expect(nextProductionInspectorSection('sinks', 'cutouts')).toBe('cutouts');
  });

  it('allows the currently open Piece Inspector section to collapse', () => {
    expect(nextProductionInspectorSection('seams', 'seams')).toBeNull();
  });

  it('opens a section from the fully collapsed state', () => {
    const current: ProductionPieceInspectorSection | null = null;
    expect(nextProductionInspectorSection(current, 'pieceInfo')).toBe(
      'pieceInfo',
    );
  });
});
