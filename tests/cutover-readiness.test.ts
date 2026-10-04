import { describe, expect, it } from 'vitest';

import {
  AppStore,
  ApplicationEffects,
  CommandDispatcher,
  ProjectLifecycle,
  SelectionController,
  StartupRecovery,
  applicationStateFromLegacyPayload,
  setActiveLayout,
  setWorkspace,
  transformPieces,
  updateDimension,
  updateFloorPlan,
  updateRoomFeature,
  updateSlabSurface,
  type AutosaveStorage,
} from '../src/app';
import {
  createAnnotationCanvasProjection,
  createFloorPlanCanvasProjection,
  createPieceCanvasProjection,
  createProductionOutputMetadata,
  createRoomFeatureCanvasProjection,
  productionOutputFilename,
  productionOutputStateForLayout,
} from '../src/browser';
import {
  CAD_LITE_SCHEMA_VERSION,
  deserializeCadLiteFile,
} from '../src/persistence';
import {
  v159GoldenProjectFixture,
  v159GoldenSnapshotFixture,
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

function runtime(storage = new MemoryStorage()) {
  const store = new AppStore(
    applicationStateFromLegacyPayload(
      structuredClone(v159GoldenSnapshotFixture),
    ),
  );
  const commands = new CommandDispatcher(store);
  const effects = new ApplicationEffects(store, {
    autosaveStorage: storage,
    autosave: { debounceMs: 60_000, appVersion: '1.6.0' },
  });
  effects.start();
  const lifecycle = new ProjectLifecycle(store, effects, {
    appVersion: '1.6.0',
  });
  return { storage, store, commands, effects, lifecycle };
}

function kitchen(store: AppStore) {
  const layout = store
    .getState()
    .project.layouts.find((item) => item.id === 'layout-kitchen');
  if (!layout) throw new Error('Golden fixture requires Kitchen.');
  return layout;
}

describe('Batch 84 cutover readiness', () => {
  it('survives a representative v1.5.99 import-to-recovery cutover journey without durable-state drift', () => {
    const storage = new MemoryStorage();
    const source = runtime(storage);

    try {
      const imported = source.lifecycle.importPayload(
        structuredClone(v159GoldenProjectFixture),
      );
      expect(imported.autosaved).toBe(true);

      source.commands.execute(setActiveLayout('layout-kitchen'));
      source.commands.execute(setWorkspace('design'));

      const selection = new SelectionController(source.store, source.commands);
      expect(selection.selectPiece('piece-1')).toBe(true);
      expect(selection.selectPiece('piece-island', true)).toBe(true);
      expect(source.store.getState().session.selection).toEqual({
        kind: 'pieces',
        ids: ['piece-1', 'piece-island'],
      });

      const beforeEdit = structuredClone(source.store.getState().project);
      source.commands.executeTransaction('Cutover design edit', [
        transformPieces('layout-kitchen', [
          {
            id: 'piece-1',
            designPose: { x: 31, y: 24, rotation: 0 },
          },
        ]),
        updateDimension('layout-kitchen', 'dim-1', { offsetPx: 31 }),
        updateRoomFeature('layout-kitchen', 'room-base-1', { x: 52 }),
        updateFloorPlan('layout-kitchen', { opacity: 0.55, offsetX: 2.25 }),
      ]);

      expect(source.effects.history.getStatus()).toMatchObject({
        canUndo: true,
        undoLabel: 'Cutover design edit',
      });
      expect(kitchen(source.store).pieces.find((piece) => piece.id === 'piece-splash')).toMatchObject({
        x: 31,
        y: 20,
        w: 96,
        attachment: {
          parentPieceId: 'piece-1',
          linkedLength: true,
          snapped: true,
        },
      });

      expect(source.effects.history.undo()).toBe(true);
      expect(source.store.getState().project).toEqual(beforeEdit);
      expect(source.effects.history.redo()).toBe(true);

      source.commands.execute(setWorkspace('slab'));
      source.commands.execute(
        transformPieces('layout-kitchen', [
          {
            id: 'piece-island',
            slabPose: { x: 18, y: 20, rotation: 90 },
          },
        ]),
      );
      source.commands.execute(
        updateSlabSurface('layout-kitchen', 'slab-1', {
          x: 12,
          y: 14,
          opacity: 0.72,
        }),
      );

      const savedProject = structuredClone(source.store.getState().project);
      expect(source.effects.autosave.flush()).toBe(true);

      const exported = source.lifecycle.exportJson(false);
      const canonical = deserializeCadLiteFile(exported);
      expect(canonical.schemaVersion).toBe(CAD_LITE_SCHEMA_VERSION);
      expect(canonical.appVersion).toBe('1.6.0');
      expect(canonical.editor).toMatchObject({
        activeLayoutId: 'layout-kitchen',
        workspace: 'slab',
      });

      source.effects.stop(false);

      const target = runtime(storage);
      try {
        const recovery = new StartupRecovery(target.lifecycle, target.effects);
        expect(recovery.inspect()).toMatchObject({
          status: 'available',
          projectName: 'Architecture Test',
          layoutCount: 2,
        });
        recovery.recover();

        const recovered = target.store.getState();
        expect(recovered.project).toEqual(savedProject);
        expect(recovered.session).toMatchObject({
          activeLayoutId: 'layout-kitchen',
          workspace: 'slab',
          selection: { kind: 'none' },
        });
        expect(recovered.session.interaction.activeTool).toBeNull();
        expect(target.effects.history.getStatus()).toMatchObject({
          size: 1,
          index: 0,
          canUndo: false,
          canRedo: false,
        });
        expect(target.lifecycle.exportJson(false)).toBe(exported);

        const recoveredKitchen = kitchen(target.store);
        expect(recoveredKitchen.pieces.find((piece) => piece.id === 'piece-island')).toMatchObject({
          slabPlacement: { x: 18, y: 20, rotation: 90 },
        });
        expect(recoveredKitchen.overlays.find((slab) => slab.id === 'slab-1')).toMatchObject({
          x: 12,
          y: 14,
          opacity: 0.72,
        });

        const slabProjection = createPieceCanvasProjection(recovered);
        expect(slabProjection.workspace).toBe('slab');
        expect(slabProjection.slabs.map((slab) => slab.id)).toEqual(['slab-1']);

        const beforeOutput = structuredClone(target.store.getState());
        const bathOutput = productionOutputStateForLayout(recovered, 'layout-bath');
        expect(bathOutput.session).toMatchObject({
          activeLayoutId: 'layout-bath',
          selection: { kind: 'none' },
        });
        expect(target.store.getState()).toEqual(beforeOutput);

        const metadata = createProductionOutputMetadata(
          bathOutput,
          'layout-bath',
          'fallback-date',
        );
        expect(metadata).not.toBeNull();
        if (!metadata) throw new Error('Bath output metadata was not created.');
        expect(productionOutputFilename(metadata, 'pdf-current')).toBe(
          'Architecture_Test_2026-09-30.pdf',
        );

        target.commands.execute(setWorkspace('design'));
        const design = target.store.getState();
        expect(createPieceCanvasProjection(design).workspace).toBe('design');
        expect(createAnnotationCanvasProjection(design).dimensions.map((item) => item.id)).toEqual([
          'dim-1',
        ]);
        expect(createRoomFeatureCanvasProjection(design).items).toHaveLength(3);
        expect(createFloorPlanCanvasProjection(design)?.plan.id).toBe('plan-kitchen');
      } finally {
        target.effects.stop(false);
      }
    } finally {
      source.effects.stop(false);
    }
  });
});
