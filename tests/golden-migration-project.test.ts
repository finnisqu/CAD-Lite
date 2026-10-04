import { describe, expect, it } from 'vitest';

import {
  AppStore,
  ApplicationEffects,
  ProjectLifecycle,
  applicationStateFromLegacyPayload,
  type ApplicationState,
  type AutosaveStorage,
  type ReadonlyApplicationState,
} from '../src/app';
import { createAnnotationCanvasProjection } from '../src/browser/annotation-canvas-model';
import { createFloorPlanCanvasProjection } from '../src/browser/floor-plan-canvas-model';
import { createPieceCanvasProjection } from '../src/browser/piece-canvas-model';
import {
  createProductionOutputMetadata,
  productionOutputFilename,
  productionOutputStateForLayout,
} from '../src/browser/production-output-model';
import { createRoomFeatureCanvasProjection } from '../src/browser/room-feature-canvas-model';
import {
  CAD_LITE_SCHEMA_VERSION,
  deserializeCadLiteFile,
  migrateCadLiteFile,
} from '../src/persistence';
import {
  v159GoldenProjectFixture as v159ProjectFixture,
  v159GoldenSnapshotFixture as v159SnapshotFixture,
} from './fixtures/v159-golden-project';

class MemoryStorage implements AutosaveStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function stateForWorkspace(
  state: ReadonlyApplicationState,
  layoutId: string,
  workspace: 'design' | 'slab',
): ApplicationState {
  const outputState = productionOutputStateForLayout(state, layoutId);
  return {
    ...outputState,
    session: {
      ...outputState.session,
      workspace,
      selection: { kind: 'none' },
      transient: {},
    },
  };
}

function createLifecycle(payload: unknown) {
  const store = new AppStore(applicationStateFromLegacyPayload(payload));
  const storage = new MemoryStorage();
  const effects = new ApplicationEffects(store, {
    autosaveStorage: storage,
    autosave: { debounceMs: 60_000 },
  });
  effects.start();
  const lifecycle = new ProjectLifecycle(store, effects, {
    appVersion: '1.6.0-golden',
  });
  return { store, storage, effects, lifecycle };
}

describe('Batch 62 golden v1.5.99 migration project', () => {
  it('migrates one representative project across the production feature families', () => {
    const file = migrateCadLiteFile(v159ProjectFixture);

    expect(file.schemaVersion).toBe(CAD_LITE_SCHEMA_VERSION);
    expect(file.project.meta).toMatchObject({
      name: 'Architecture Test',
      date: '2026-09-30',
    });
    expect(file.project.materials.map((material) => material.id)).toEqual([
      'mat-quartz',
      'mat-granite',
    ]);

    const kitchen = file.project.layouts.find(
      (layout) => layout.id === 'layout-kitchen',
    );
    const bath = file.project.layouts.find(
      (layout) => layout.id === 'layout-bath',
    );
    expect(kitchen).toBeDefined();
    expect(bath).toBeDefined();
    if (!kitchen || !bath) throw new Error('Golden layouts were not migrated.');

    expect(kitchen.areas.map((area) => area.id)).toEqual([
      'area-kitchen',
      'area-island',
    ]);
    expect(kitchen.activeAreaId).toBe('area-island');
    expect(kitchen.pieces).toHaveLength(4);
    expect(
      kitchen.pieces.filter((piece) => piece.pieceGroupId === 'group-perimeter'),
    ).toHaveLength(2);

    const sinkRun = kitchen.pieces.find((piece) => piece.id === 'piece-1');
    const cooktopRun = kitchen.pieces.find(
      (piece) => piece.id === 'piece-cooktop-run',
    );
    const island = kitchen.pieces.find((piece) => piece.id === 'piece-island');
    const splash = kitchen.pieces.find((piece) => piece.id === 'piece-splash');
    expect(sinkRun?.sinks[0]).toMatchObject({
      id: 'sink-kitchen',
      side: 'front',
      centerline: 48,
      setback: 3.5,
      faucets: [0, 1, 2],
    });
    expect(sinkRun?.pieceSeams[0]).toMatchObject({
      id: 'seam-planning-1',
      orientation: 'vertical',
      reference: 'left',
      offset: 48,
    });
    expect(sinkRun?.assemblyLinks[0]).toMatchObject({
      id: 'seam-fabrication-1',
      kind: 'seam',
      matePieceId: 'piece-cooktop-run',
    });
    expect(cooktopRun?.cutouts[0]).toMatchObject({
      id: 'cutout-cooktop',
      kind: 'rectangle',
      w: 30,
      h: 20,
    });
    expect(island?.sinks[0]?.id).toBe('sink-prep');
    expect(island?.cutouts[0]).toMatchObject({
      id: 'cutout-grommet',
      kind: 'circle',
      diameter: 2.5,
    });
    expect(splash?.attachment).toMatchObject({
      kind: 'backsplash',
      parentPieceId: 'piece-1',
      sourceEdge: 'top',
      linkedLength: true,
      snapped: true,
    });

    expect(kitchen.dims.map((dimension) => dimension.id)).toEqual(['dim-1']);
    expect(kitchen.notes.map((note) => note.id)).toEqual(['note-1']);
    expect(kitchen.lines.map((line) => line.id)).toEqual([
      'line-note-leader',
      'line-field-joint',
    ]);
    expect(kitchen.lines[0]).toMatchObject({
      attachedNoteId: 'note-1',
      attachedEnd: 'start',
    });

    expect(kitchen.roomFeatures.map((feature) => feature.id)).toEqual([
      'room-base-1',
      'room-dw-1',
      'room-wall-1',
    ]);
    expect(kitchen.roomFeatures[2]).toMatchObject({
      wallType: 'full',
      height: 96,
    });
    expect(kitchen.plan).toMatchObject({
      id: 'plan-kitchen',
      calibrated: true,
      locked: true,
      includeInExport: true,
      offsetX: 1.25,
      offsetY: -0.5,
    });
    expect(kitchen.overlays.map((slab) => slab.id)).toEqual(['slab-1']);
    expect(kitchen.extra).toEqual({ slabCW: 300, slabCH: 200, ovSel: 0 });

    expect(bath.pieces[0]?.id).toBe('piece-vanity');
    expect(bath.pieces[0]?.sinks[0]?.id).toBe('sink-vanity');
    expect(bath.overlays[0]?.id).toBe('slab-bath');
  });

  it('projects the same migrated Kitchen coherently through DESIGN, SLAB, and output preparation', () => {
    const migrated = applicationStateFromLegacyPayload(v159ProjectFixture);
    const design = stateForWorkspace(migrated, 'layout-kitchen', 'design');

    const pieces = createPieceCanvasProjection(design);
    expect(pieces.workspace).toBe('design');
    expect(pieces.layoutId).toBe('layout-kitchen');
    expect(pieces.pieces.map((piece) => piece.id)).toEqual([
      'piece-1',
      'piece-cooktop-run',
      'piece-island',
      'piece-splash',
    ]);
    expect(pieces.slabs).toEqual([]);

    const sinkRun = pieces.pieces.find((piece) => piece.id === 'piece-1');
    const cooktopRun = pieces.pieces.find(
      (piece) => piece.id === 'piece-cooktop-run',
    );
    expect(sinkRun?.sinks.map((sink) => sink.id)).toEqual(['sink-kitchen']);
    expect(sinkRun?.seams.map((seam) => [seam.id, seam.kind])).toEqual([
      ['seam-planning-1', 'planning'],
      ['seam-fabrication-1', 'fabrication'],
    ]);
    expect(cooktopRun?.cutouts.map((cutout) => cutout.id)).toEqual([
      'cutout-cooktop',
    ]);

    const annotations = createAnnotationCanvasProjection(design);
    expect(annotations.dimensions.map((dimension) => dimension.id)).toEqual([
      'dim-1',
    ]);
    expect(annotations.notes.map((note) => note.id)).toEqual(['note-1']);
    expect(annotations.lines.map((line) => line.id)).toEqual([
      'line-note-leader',
      'line-field-joint',
    ]);

    const roomFeatures = createRoomFeatureCanvasProjection(design);
    expect(roomFeatures.items.map((item) => item.category)).toEqual([
      'cabinet',
      'appliance',
      'wall',
    ]);

    const floorPlan = createFloorPlanCanvasProjection(design);
    expect(floorPlan).not.toBeNull();
    expect(floorPlan?.plan).toMatchObject({
      id: 'plan-kitchen',
      calibrated: true,
      includeInExport: true,
    });

    const metadata = createProductionOutputMetadata(
      design,
      'layout-kitchen',
      'fallback-date',
    );
    expect(metadata).toMatchObject({
      projectName: 'Architecture Test',
      projectDate: '2026-09-30',
      layoutId: 'layout-kitchen',
      layoutName: 'Kitchen',
    });
    if (!metadata) throw new Error('Golden output metadata was not created.');
    expect(productionOutputFilename(metadata, 'pdf-all')).toBe(
      'Architecture_Test_2026-09-30_AllLayouts.pdf',
    );

    const slab = stateForWorkspace(migrated, 'layout-kitchen', 'slab');
    const slabPieces = createPieceCanvasProjection(slab);
    expect(slabPieces.workspace).toBe('slab');
    expect(slabPieces.pieces).toHaveLength(4);
    expect(slabPieces.slabs.map((surface) => surface.id)).toEqual(['slab-1']);
    expect(createAnnotationCanvasProjection(slab)).toEqual({
      dimensions: [],
      lines: [],
      notes: [],
    });
    expect(createRoomFeatureCanvasProjection(slab).items).toEqual([]);
    expect(createFloorPlanCanvasProjection(slab)).toBeNull();
  });

  it('round-trips the golden project through legacy import, canonical save, and a fresh reload without data drift', () => {
    const source = createLifecycle(v159SnapshotFixture);
    const target = createLifecycle(v159SnapshotFixture);

    try {
      const imported = source.lifecycle.importPayload(v159ProjectFixture);
      expect(imported.autosaved).toBe(true);
      expect(source.store.getState().session.activeLayoutId).toBe('layout-bath');
      expect(source.store.getState().session.workspace).toBe('slab');

      const exported = source.lifecycle.exportJson();
      const canonical = deserializeCadLiteFile(exported);
      expect(canonical.schemaVersion).toBe(CAD_LITE_SCHEMA_VERSION);
      expect(canonical.project.layouts[0]?.pieces).toHaveLength(4);
      expect(canonical.project.layouts[0]?.plan?.id).toBe('plan-kitchen');

      const reloaded = target.lifecycle.importJson(exported);
      expect(reloaded.autosaved).toBe(true);
      expect(target.store.getState().project).toEqual(
        source.store.getState().project,
      );
      expect(target.store.getState().preferences).toEqual(
        source.store.getState().preferences,
      );
      expect(target.store.getState().session).toMatchObject({
        activeLayoutId: 'layout-bath',
        workspace: 'slab',
        selection: { kind: 'none' },
        transient: {},
      });
      expect(target.store.getState().session.interaction.activeTool).toBeNull();
      expect(target.lifecycle.exportJson()).toBe(exported);
    } finally {
      source.effects.stop(false);
      target.effects.stop(false);
    }
  });
});
