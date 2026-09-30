import { describe, expect, it } from 'vitest';

import {
  CAD_LITE_SCHEMA_VERSION,
  deserializeCadLiteFile,
  isCanonicalCadLiteFile,
  migrateCadLiteFile,
  serializeCadLiteFile,
  UnsupportedCadLiteSchemaError,
} from '../src/persistence';
import {
  v159ProjectFixture,
  v159SnapshotFixture,
} from './fixtures/v159-project';

describe('canonical CAD Lite persistence', () => {
  it('migrates the v1.5.99 exportApp shape into schema v1', () => {
    const migrated = migrateCadLiteFile(v159ProjectFixture);

    expect(migrated.schemaVersion).toBe(CAD_LITE_SCHEMA_VERSION);
    expect(migrated.project.meta.name).toBe('Architecture Test');
    expect(migrated.project.materials[0]?.name).toBe('Quartz A');
    expect(migrated.project.layouts).toHaveLength(2);
    expect(migrated.project.layouts[0]?.extra).toEqual({
      slabCW: 300,
      slabCH: 200,
      ovSel: 0,
    });
    expect(migrated.editor.activeLayoutId).toBe('layout-bath');
    expect(migrated.editor.workspace).toBe('slab');
    expect(migrated.editor.preferences.edgeLabelMode).toBe('symbol');
    expect(migrated.editor.preferences.slabCutClearance).toBe(0.25);
    expect(migrated.editor.preferences.pieceSnap).toBe(true);
  });

  it('migrates the v1.5.99 history/share snapshot shape separately from selection', () => {
    const migrated = migrateCadLiteFile(v159SnapshotFixture);

    expect(migrated.editor.activeLayoutId).toBe('layout-kitchen');
    expect(migrated.editor.workspace).toBe('design');
    expect(migrated.editor.preferences.gridSnap).toBe(false);
    expect(migrated.editor.preferences.showGrid).toBe(false);
    expect(migrated.editor.preferences.dimPrecision).toBe(8);
    expect(migrated.editor.preferences.dimFormat).toBe('decimal');

    const serialized = serializeCadLiteFile(migrated);
    expect(serialized).not.toContain('selectedIds');
    expect(serialized).not.toContain('selectedId');
  });

  it('round-trips a migrated project through canonical JSON', () => {
    const migrated = migrateCadLiteFile(v159ProjectFixture);
    const serialized = serializeCadLiteFile(migrated);
    const restored = deserializeCadLiteFile(serialized);

    expect(restored).toEqual(migrated);
    expect(isCanonicalCadLiteFile(restored)).toBe(true);
  });

  it('normalizes missing legacy ids deterministically', () => {
    const legacy = structuredClone(v159ProjectFixture);
    const layouts = legacy.layouts;
    if (!Array.isArray(layouts) || !layouts[0] || typeof layouts[0] !== 'object') {
      throw new Error('Fixture shape changed');
    }

    const firstLayout = layouts[0] as Record<string, unknown>;
    delete firstLayout.id;

    const first = migrateCadLiteFile(legacy);
    const second = migrateCadLiteFile(legacy);

    expect(first.project.layouts[0]?.id).toBe('migrated-layout-1');
    expect(second.project.layouts[0]?.id).toBe('migrated-layout-1');
  });

  it('repairs duplicate/missing areas and clamps core persisted values', () => {
    const legacy = structuredClone(v159ProjectFixture);
    const layouts = legacy.layouts;
    if (!Array.isArray(layouts) || !layouts[0] || typeof layouts[0] !== 'object') {
      throw new Error('Fixture shape changed');
    }

    const firstLayout = layouts[0] as Record<string, unknown>;
    firstLayout.quantity = 50_000;
    firstLayout.pieceFillOpacity = 2;
    firstLayout.areas = [
      { id: 'dup', name: 'A' },
      { id: 'dup', name: '' },
    ];
    firstLayout.activeAreaId = 'missing';

    const migrated = migrateCadLiteFile(legacy);
    const layout = migrated.project.layouts[0];

    expect(layout?.quantity).toBe(9999);
    expect(layout?.pieceFillOpacity).toBe(1);
    expect(layout?.areas).toEqual([
      { id: 'dup', name: 'A' },
      { id: 'migrated-layout-1-area-2', name: 'Area 2' },
    ]);
    expect(layout?.activeAreaId).toBe('dup');
  });

  it('rejects unknown future schemas instead of guessing', () => {
    expect(() =>
      migrateCadLiteFile({
        schemaVersion: 99,
        appVersion: 'future',
        project: {},
        editor: {},
      }),
    ).toThrow(UnsupportedCadLiteSchemaError);
  });

  it('rejects unrelated JSON', () => {
    expect(() => migrateCadLiteFile({ hello: 'world' })).toThrow(
      'Unrecognized CAD Lite project format.',
    );
  });
});
