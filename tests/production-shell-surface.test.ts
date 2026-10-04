import { describe, expect, it } from 'vitest';

import {
  nextProductionShellCollapsedSections,
  productionShellPanelId,
} from '../src/browser/production-shell-surface';

describe('production shell disclosure state', () => {
  it('toggles one Navigator section without disturbing the others', () => {
    const current = new Set(['project', 'areas']);
    const expandedProject = nextProductionShellCollapsedSections(
      current,
      'project',
    );

    expect([...expandedProject].sort()).toEqual(['areas']);
    expect([...current].sort()).toEqual(['areas', 'project']);

    const collapsedPieces = nextProductionShellCollapsedSections(
      expandedProject,
      'pieces',
    );
    expect([...collapsedPieces].sort()).toEqual(['areas', 'pieces']);
  });

  it('builds stable ids for menu and Navigator disclosure panels', () => {
    expect(productionShellPanelId('menu', 'EDIT')).toBe(
      'cad-lite-production-shell-menu-edit-panel',
    );
    expect(productionShellPanelId('nav', 'pieceGroups')).toBe(
      'cad-lite-production-shell-nav-piece-groups-panel',
    );
  });
});
