import { describe, expect, it } from 'vitest';

import {
  booleanViewPreferenceFromControlId,
  canvasGridMajorLineCoordinate,
  dimensionFormatFromControl,
  dimensionPrecisionFromControl,
} from '../src/browser/view-preferences-surface';

describe('number format preference controls', () => {
  it('accepts the supported dimension formats', () => {
    expect(dimensionFormatFromControl('fraction')).toBe('fraction');
    expect(dimensionFormatFromControl('decimal')).toBe('decimal');
    expect(dimensionFormatFromControl('other')).toBeNull();
  });

  it('accepts only supported fractional precisions', () => {
    expect(dimensionPrecisionFromControl('1')).toBe(1);
    expect(dimensionPrecisionFromControl('2')).toBe(2);
    expect(dimensionPrecisionFromControl('4')).toBe(4);
    expect(dimensionPrecisionFromControl('8')).toBe(8);
    expect(dimensionPrecisionFromControl('16')).toBe(16);
    expect(dimensionPrecisionFromControl('3')).toBeNull();
    expect(dimensionPrecisionFromControl('0')).toBeNull();
    expect(dimensionPrecisionFromControl('abc')).toBeNull();
  });
});

describe('view preference controls', () => {
  it('maps the supported browser controls to typed preferences', () => {
    expect(booleanViewPreferenceFromControlId('lc-show-grid')).toBe('showGrid');
    expect(booleanViewPreferenceFromControlId('lc-show-dims')).toBe('showDims');
    expect(booleanViewPreferenceFromControlId('lc-show-manual-dims')).toBe(
      'showManualDims',
    );
    expect(booleanViewPreferenceFromControlId('lc-show-notes')).toBe('showNotes');
    expect(booleanViewPreferenceFromControlId('lc-show-lines')).toBe('showLines');
    expect(booleanViewPreferenceFromControlId('lc-show-piece-fills')).toBe(
      'showPieceFills',
    );
    expect(booleanViewPreferenceFromControlId('lc-show-room-features')).toBe(
      'showRoomFeatures',
    );
    expect(booleanViewPreferenceFromControlId('lc-show-room-feature-labels')).toBe(
      'showRoomFeatureLabels',
    );
    expect(booleanViewPreferenceFromControlId('lc-show-room-cabinets')).toBe(
      'showRoomCabinets',
    );
    expect(booleanViewPreferenceFromControlId('lc-show-room-fillers-panels')).toBe(
      'showRoomFillersPanels',
    );
    expect(booleanViewPreferenceFromControlId('lc-show-room-appliances')).toBe(
      'showRoomAppliances',
    );
    expect(booleanViewPreferenceFromControlId('lc-show-room-walls')).toBe(
      'showRoomWalls',
    );
  });

  it('does not claim controls owned by other browser surfaces', () => {
    expect(booleanViewPreferenceFromControlId('lc-show-seams')).toBeNull();
    expect(booleanViewPreferenceFromControlId('lc-piece-snap')).toBeNull();
    expect(booleanViewPreferenceFromControlId('unknown')).toBeNull();
  });
});

describe('canvas grid pattern geometry', () => {
  it('keeps the major stroke center inside the repeating tile', () => {
    expect(canvasGridMajorLineCoordinate(6, 8)).toBeCloseTo(5.9375, 10);
    expect(canvasGridMajorLineCoordinate(6, 8)).toBeLessThan(6);
    expect(canvasGridMajorLineCoordinate(6, 1)).toBe(5.5);
  });
});
