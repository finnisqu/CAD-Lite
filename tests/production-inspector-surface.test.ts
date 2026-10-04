import { describe, expect, it } from 'vitest';

import {
  nextProductionInspectorSection,
  type ProductionPieceInspectorSection,
} from '../src/browser';
import { productionInspectorPanelId } from '../src/browser/production-inspector-surface';

describe('production Inspector accordion state', () => {
  it('opens a requested Piece Inspector section exclusively', () => {
    expect(nextProductionInspectorSection('pieceInfo', 'appearance')).toBe(
      'appearance',
    );
    expect(nextProductionInspectorSection('appearance', 'overhangs')).toBe(
      'overhangs',
    );
    expect(nextProductionInspectorSection('overhangs', 'splashes')).toBe(
      'splashes',
    );
    expect(nextProductionInspectorSection('splashes', 'edgeOptions')).toBe(
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

  it('builds stable disclosure panel ids across Inspector rerenders', () => {
    expect(productionInspectorPanelId('piece', 'pieceInfo')).toBe(
      'cad-lite-production-inspector-piece-piece-info-panel',
    );
    expect(productionInspectorPanelId('piece', 'edgeOptions')).toBe(
      'cad-lite-production-inspector-piece-edge-options-panel',
    );
    expect(productionInspectorPanelId('context', 'pieceGroup')).toBe(
      'cad-lite-production-inspector-context-piece-group-panel',
    );
    expect(productionInspectorPanelId('piece', 'sinks', 1)).toBe(
      'cad-lite-production-inspector-piece-sinks-panel-2',
    );
  });
});
