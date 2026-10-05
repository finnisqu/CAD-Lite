import { describe, expect, it } from 'vitest';

import {
  PIECE_GROUP_ACCENTS,
  PRODUCTION_NAVIGATOR_SECTION_ORDER,
  classifyGeneratedNavigatorBlock,
  shouldCollapseProductionNavigator,
} from '../src/browser/production-navigator-parity';
import {
  PRODUCTION_RAIL_LIMITS,
  clampProductionRailWidth,
} from '../src/browser/production-rail-resize';
import navigatorParitySource from '../src/browser/production-navigator-parity.ts?raw';
import mainSource from '../src/main.ts?raw';

describe('v1.5.99 Navigator parity', () => {
  it('collapses all when any section is open and restores all when none are open', () => {
    expect(shouldCollapseProductionNavigator([true, true, true])).toBe(true);
    expect(shouldCollapseProductionNavigator([true, false, false])).toBe(true);
    expect(shouldCollapseProductionNavigator([false, false, false])).toBe(false);
    expect(shouldCollapseProductionNavigator([])).toBe(false);
  });

  it('restores the v1.5.99 top-level Navigator order', () => {
    expect(PRODUCTION_NAVIGATOR_SECTION_ORDER).toEqual([
      'project',
      'layouts',
      'areas-pieces',
      'notes',
      'dimensions',
      'lines',
      'room-features',
      'plan',
      'selections',
      'estimate',
      'slabs',
    ]);
  });

  it('routes generated feature blocks into their dedicated sections', () => {
    expect(classifyGeneratedNavigatorBlock('lc-annotation-nav-section', 'Notes (2)')).toBe('notes');
    expect(classifyGeneratedNavigatorBlock('lc-annotation-nav-section', 'Dimensions (1)')).toBe('dimensions');
    expect(classifyGeneratedNavigatorBlock('lc-annotation-nav-section', 'Lines (3)')).toBe('lines');
    expect(classifyGeneratedNavigatorBlock('lc-room-feature-nav-section', 'Room Features (1)')).toBe('room-features');
    expect(classifyGeneratedNavigatorBlock('lc-floor-plan-nav lc-annotation-nav-section', 'Floor Plan')).toBe('plan');
  });

  it('restores the exact v1.5.99 six-color piece-group accent cycle', () => {
    expect(PIECE_GROUP_ACCENTS).toEqual([
      '#5c8fbe',
      '#8d70b5',
      '#6e9a70',
      '#c17a67',
      '#9c8b4f',
      '#5b8f8a',
    ]);
  });

  it('creates real sibling mounts and body-level add controls', () => {
    expect(navigatorParitySource).toContain("setSectionTitle(areas, 'Areas & Pieces')");
    expect(navigatorParitySource).toContain("mountId: 'lc-notes-nav'");
    expect(navigatorParitySource).toContain("mountId: 'lc-dimensions-nav'");
    expect(navigatorParitySource).toContain("mountId: 'lc-lines-nav'");
    expect(navigatorParitySource).toContain("mountId: 'lc-room-features-nav'");
    expect(navigatorParitySource).toContain("mountId: 'lc-plan-nav'");
    expect(navigatorParitySource).toContain("mountId: 'lc-estimate-nav'");
    expect(navigatorParitySource).toContain('observer?.disconnect()');
    expect(navigatorParitySource).toContain("addPiece.textContent = '+ Add Piece'");
    expect(navigatorParitySource).toContain("addArea.textContent = '+ Add Area'");
    expect(navigatorParitySource).toContain("add.textContent = '+ Add Layout'");
  });

  it('bounds Navigator and Inspector rail resizing', () => {
    expect(PRODUCTION_RAIL_LIMITS.navigator).toEqual({ min: 190, max: 420 });
    expect(PRODUCTION_RAIL_LIMITS.inspector).toEqual({ min: 220, max: 480 });
    expect(clampProductionRailWidth('navigator', 120)).toBe(190);
    expect(clampProductionRailWidth('navigator', 500)).toBe(420);
    expect(clampProductionRailWidth('inspector', 360)).toBe(360);
  });

  it('keeps disclosure ownership in the production shell while loading the parity layer last', () => {
    expect(navigatorParitySource).toContain('toggle.click()');
    expect(navigatorParitySource).toContain('queueMicrotask(syncHeader)');
    expect(mainSource).toContain("import './browser/production-navigator-parity';");
    expect(mainSource).toContain("import './browser/production-rail-resize';");
    expect(mainSource).toContain("import './styles/production-navigator-v159-parity.css';");
    expect(mainSource.indexOf("import './styles/production-v159-parity.css';")).toBeLessThan(
      mainSource.indexOf("import './styles/production-navigator-v159-parity.css';"),
    );
  });
});
