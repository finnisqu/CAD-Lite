import { describe, expect, it } from 'vitest';

import { CAD_LITE_ARCHITECTURE_VERSION } from '../src/app/build-info';
import devHarnessSource from '../dev/index.html?raw';
import packageJsonSource from '../package.json?raw';
import projectFileSurfaceSource from '../src/browser/project-file-surface.ts?raw';
import viteConfigSource from '../vite.config.ts?raw';

describe('Batch 83 release-candidate cleanup', () => {
  it('uses one v1.6.0 release identity across runtime and package metadata', () => {
    const packageJson = JSON.parse(packageJsonSource) as { version: string };

    expect(CAD_LITE_ARCHITECTURE_VERSION).toBe('1.6.0');
    expect(packageJson.version).toBe('1.6.0');
  });

  it('freezes the production entry, final artifact names, and production source-map policy', () => {
    expect(viteConfigSource).toContain(
      "entry: new URL('./src/main.ts', import.meta.url).pathname",
    );
    expect(viteConfigSource).toContain("sourcemap: mode !== 'production'");
    expect(viteConfigSource).toContain("fileName: () => 'cad-lite-v1.6.0.js'");
    expect(viteConfigSource).toContain("cssFileName: 'cad-lite-v1.6.0'");
  });

  it('keeps architecture-harness file controls in dev markup instead of production fallback code', () => {
    for (const id of [
      'lc-new-project',
      'lc-import-project',
      'lc-export-project',
      'lc-project-file-input',
      'lc-file-status',
    ]) {
      expect(devHarnessSource).toContain(`id="${id}"`);
    }

    expect(projectFileSurfaceSource).not.toContain(
      'cad-lite-architecture-harness__history',
    );
    expect(projectFileSurfaceSource).not.toContain('ensureHarnessControls');
    expect(projectFileSurfaceSource).not.toContain('generatedControls');
  });
});
