import { describe, expect, it } from 'vitest';

import { applicationStateFromLegacyPayload } from '../src/app';
import {
  createProductionOutputMetadata,
  productionOutputFilename,
  productionOutputStateForLayout,
  productionPdfPlacement,
} from '../src/browser';
import { v159ProjectFixture } from './fixtures/v159-project';

describe('production output model', () => {
  it('prepares v1.5.99-style output metadata and filenames', () => {
    const state = applicationStateFromLegacyPayload(
      structuredClone(v159ProjectFixture),
    );
    const metadata = createProductionOutputMetadata(
      state,
      'layout-kitchen',
      '2026-10-04',
    );

    expect(metadata).not.toBeNull();
    if (!metadata) throw new Error('Expected output metadata.');
    expect(metadata).toMatchObject({
      projectName: 'Architecture Test',
      projectDate: '2026-09-30',
      projectNotes: 'Golden migration seed',
      layoutId: 'layout-kitchen',
      layoutName: 'Kitchen',
    });
    expect(productionOutputFilename(metadata, 'pdf-current')).toBe(
      'Architecture_Test_2026-09-30.pdf',
    );
    expect(productionOutputFilename(metadata, 'pdf-all')).toBe(
      'Architecture_Test_2026-09-30_AllLayouts.pdf',
    );
    expect(productionOutputFilename(metadata, 'png')).toBe(
      'Architecture_Test_2026-09-30.png',
    );
    expect(productionOutputFilename(metadata, 'svg')).toBe(
      'Architecture_Test_2026-09-30.svg',
    );
  });

  it('uses a deterministic fallback date and filesystem-safe project name', () => {
    expect(
      productionOutputFilename(
        { projectName: 'Kitchen / Bath: Rev 2', projectDate: '' },
        'pdf-all',
      ),
    ).toBe('Kitchen_-_Bath-_Rev_2_undated_AllLayouts.pdf');
  });

  it('prepares another layout for output without mutating project data', () => {
    const state = applicationStateFromLegacyPayload(
      structuredClone(v159ProjectFixture),
    );
    const originalLayoutId = state.session.activeLayoutId;
    const originalSelection = state.session.selection;
    const output = productionOutputStateForLayout(state, 'layout-kitchen');

    expect(output).not.toBe(state);
    expect(output.project).toBe(state.project);
    expect(output.preferences).toBe(state.preferences);
    expect(output.session.activeLayoutId).toBe('layout-kitchen');
    expect(output.session.selection).toEqual({ kind: 'none' });
    expect(state.session.activeLayoutId).toBe(originalLayoutId);
    expect(state.session.selection).toBe(originalSelection);
  });

  it('fits portrait and landscape drawings inside the PDF content area', () => {
    const landscape = productionPdfPlacement(800, 400, 792, 612);
    expect(landscape.orientation).toBe('landscape');
    expect(landscape.imageWidth).toBeLessThanOrEqual(landscape.maxWidth);
    expect(landscape.imageHeight).toBeLessThanOrEqual(landscape.maxHeight);

    const portrait = productionPdfPlacement(400, 800, 612, 792);
    expect(portrait.orientation).toBe('portrait');
    expect(portrait.imageWidth).toBeLessThanOrEqual(portrait.maxWidth);
    expect(portrait.imageHeight).toBeLessThanOrEqual(portrait.maxHeight);
  });
});
