import { describe, expect, it } from 'vitest';

import {
  productionRoomModalTabTarget,
  shouldBlockProductionRoomModalKey,
} from '../src/browser/production-mode-hud-surface';
import { resolveProductionTheme } from '../src/browser/production-viewport-surface';

const DEV_FILES = import.meta.glob('../dev/production-shell.html', {
  eager: true,
  import: 'default',
  query: '?raw',
});
const BROWSER_FILES = import.meta.glob('../src/browser/*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
});

function rawFile(files: Record<string, unknown>, path: string): string {
  const source = files[path];
  if (typeof source !== 'string') throw new Error(`Missing raw acceptance source: ${path}`);
  return source;
}

function occurrenceCount(source: string, value: string): number {
  return source.split(value).length - 1;
}

describe('Batch 81 production browser acceptance contract', () => {
  const shell = rawFile(DEV_FILES, '../dev/production-shell.html');
  const runtime = rawFile(BROWSER_FILES, '../src/browser/runtime.ts');
  const output = rawFile(
    BROWSER_FILES,
    '../src/browser/production-output-surface.ts',
  );
  const viewport = rawFile(
    BROWSER_FILES,
    '../src/browser/production-viewport-surface.ts',
  );

  it('keeps the production shell control and portal hooks unique', () => {
    const ids = [
      'lc-undo',
      'lc-redo',
      'lc-zoom-out',
      'lc-zoom-in',
      'lc-piece-snap',
      'lc-grid-snap',
      'lc-theater-mode',
      'lc-fullscreen-mode',
      'lc-workspace-design',
      'lc-workspace-slab',
      'lc-svg',
      'lc-inspector',
      'lc-modal-root',
      'lc-hud-root',
      'lc-import-floor-plan',
      'lc-import-project',
      'lc-export-project',
    ];

    ids.forEach((id) => {
      expect(occurrenceCount(shell, `id="${id}"`), id).toBe(1);
    });
    expect(shell).toContain('data-cad-lite-production-shell');
    expect(shell).toContain('aria-label="Navigator"');
    expect(shell).toContain('aria-label="Inspector"');
  });

  it('keeps toolbar menus and Navigator disclosures structurally paired', () => {
    const menuButtons = occurrenceCount(shell, 'data-cad-lite-menu-button');
    const menuPanels = occurrenceCount(shell, 'data-cad-lite-menu-panel');
    expect(menuButtons).toBeGreaterThanOrEqual(5);
    expect(menuPanels).toBe(menuButtons);

    const navSections = occurrenceCount(shell, 'data-cad-lite-nav-section=');
    const navToggles = occurrenceCount(shell, 'data-cad-lite-section-toggle');
    const navBodies = occurrenceCount(shell, 'data-cad-lite-section-body');
    expect(navSections).toBeGreaterThanOrEqual(6);
    expect(navToggles).toBe(navSections);
    expect(navBodies).toBe(navSections);
  });

  it('keeps the mounted event-owner ordering explicit', () => {
    const pieceCanvas = runtime.indexOf('pieceCanvas.mount();');
    const keyboard = runtime.indexOf('canvasKeyboard.mount();');
    const modeHud = runtime.indexOf('productionModeHudSurface.mount();');
    const shellSurface = runtime.indexOf('productionShellSurface.mount();');
    const viewportSurface = runtime.indexOf('productionViewportSurface.mount();');

    expect(pieceCanvas).toBeGreaterThan(-1);
    expect(keyboard).toBeGreaterThan(pieceCanvas);
    expect(modeHud).toBeGreaterThan(keyboard);
    expect(shellSurface).toBeGreaterThan(modeHud);
    expect(viewportSurface).toBeGreaterThan(shellSurface);
  });

  it('keeps mounted production output controls available from the Export menu', () => {
    expect(shell).toContain('id="lc-export-project"');
    expect(output).toContain("['lc-export-pdf-all', 'PDF (All Layouts)']");
    expect(output).toContain("['lc-export-pdf', 'PDF (Current Layout)']");
    expect(output).toContain("['lc-export-png', 'PNG (Current Layout)']");
    expect(output).toContain("['lc-export-svg', 'SVG (Current Layout)']");
    expect(output).toContain('this.legacyNote.hidden = true');
  });

  it('keeps theme, Theater, Fullscreen, and portal runtime hooks wired', () => {
    expect(shell).toContain('id="lc-theater-mode"');
    expect(shell).toContain('id="lc-fullscreen-mode"');
    expect(shell).toContain('class="cad-lite-production-shell__portal-layer"');
    expect(viewport).toContain('shell.dataset.theme = resolved;');
    expect(viewport).toContain("classList.toggle('is-theater', enabled);");
    expect(viewport).toContain("classList.toggle('is-fullscreen', fullscreen);");
    expect(viewport).toContain("querySelector<HTMLButtonElement>('#lc-theater-mode')");
    expect(viewport).toContain("querySelector<HTMLButtonElement>('#lc-fullscreen-mode')");
  });

  it('resolves production theme modes deterministically', () => {
    expect(resolveProductionTheme('light', true)).toBe('light');
    expect(resolveProductionTheme('dark', false)).toBe('dark');
    expect(resolveProductionTheme('system', false)).toBe('light');
    expect(resolveProductionTheme('system', true)).toBe('dark');
  });

  it('allows modal Tab navigation while still isolating canvas shortcuts', () => {
    expect(shouldBlockProductionRoomModalKey('Delete', false)).toBe(true);
    expect(shouldBlockProductionRoomModalKey('p', false)).toBe(true);
    expect(shouldBlockProductionRoomModalKey('Escape', false)).toBe(false);
    expect(shouldBlockProductionRoomModalKey('Tab', false)).toBe(false);
    expect(shouldBlockProductionRoomModalKey('Delete', true)).toBe(false);

    expect(productionRoomModalTabTarget(0, 3, true)).toBe(2);
    expect(productionRoomModalTabTarget(2, 3, false)).toBe(0);
    expect(productionRoomModalTabTarget(1, 3, false)).toBeNull();
    expect(productionRoomModalTabTarget(-1, 3, false)).toBe(0);
    expect(productionRoomModalTabTarget(-1, 3, true)).toBe(2);
    expect(productionRoomModalTabTarget(0, 0, false)).toBeNull();
  });
});
