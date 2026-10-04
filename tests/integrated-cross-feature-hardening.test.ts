import { describe, expect, it } from 'vitest';

import {
  AppStore,
  ApplicationEffects,
  CommandDispatcher,
  ProjectLifecycle,
  StartupRecovery,
  applicationStateFromLegacyPayload,
  deletePieces,
  duplicatePieces,
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
  createRoomFeatureCanvasProjection,
  productionOutputStateForLayout,
} from '../src/browser';
import {
  isBacksplashPiece,
  preparePieceDuplication,
} from '../src/domain/pieces';
import { v159GoldenProjectFixture } from './fixtures/v159-golden-project';

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

const APP_VERSION = '1.6.0-batch-80';

function runtime(
  storage = new MemoryStorage(),
  workspace: 'design' | 'slab' = 'design',
) {
  const store = new AppStore(
    applicationStateFromLegacyPayload(
      structuredClone(v159GoldenProjectFixture),
    ),
  );
  const commands = new CommandDispatcher(store);

  // Establish the test workspace before effects start so each integration test
  // begins from one clean history/autosave baseline.
  commands.execute(setActiveLayout('layout-kitchen'));
  commands.execute(setWorkspace(workspace));

  const effects = new ApplicationEffects(store, {
    autosaveStorage: storage,
    autosave: { debounceMs: 60_000, appVersion: APP_VERSION },
  });
  effects.start();
  const lifecycle = new ProjectLifecycle(store, effects, {
    appVersion: APP_VERSION,
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

describe('Batch 80 integrated cross-feature regression hardening', () => {
  it('keeps a mixed DESIGN transaction atomic through splash sync, undo/redo, and save/reload', () => {
    const source = runtime();
    const target = runtime();

    try {
      const baselineProject = structuredClone(source.store.getState().project);

      source.commands.executeTransaction('Integrated design edit', [
        transformPieces('layout-kitchen', [
          {
            id: 'piece-1',
            designPose: { x: 30, y: 25, rotation: 0 },
          },
        ]),
        updateDimension('layout-kitchen', 'dim-1', { offsetPx: 33 }),
        updateRoomFeature('layout-kitchen', 'room-base-1', { x: 50 }),
        updateFloorPlan('layout-kitchen', { opacity: 0.5, offsetX: 2 }),
      ]);

      let layout = kitchen(source.store);
      const sinkRun = layout.pieces.find((piece) => piece.id === 'piece-1');
      const splash = layout.pieces.find((piece) => piece.id === 'piece-splash');

      expect(sinkRun).toMatchObject({ x: 30, y: 25, rotation: 0 });
      expect(splash).toMatchObject({
        x: 30,
        y: 21,
        w: 96,
        rotation: 0,
        attachment: {
          parentPieceId: 'piece-1',
          sourceEdge: 'top',
          linkedLength: true,
          snapped: true,
        },
      });
      expect(layout.dims.find((item) => item.id === 'dim-1')?.offsetPx).toBe(33);
      expect(layout.roomFeatures.find((item) => item.id === 'room-base-1')?.x).toBe(50);
      expect(layout.plan).toMatchObject({ opacity: 0.5, offsetX: 2 });
      expect(source.effects.history.getStatus()).toMatchObject({
        size: 2,
        index: 1,
        canUndo: true,
        undoLabel: 'Integrated design edit',
      });

      expect(source.effects.history.undo()).toBe(true);
      expect(source.store.getState().project).toEqual(baselineProject);

      expect(source.effects.history.redo()).toBe(true);
      layout = kitchen(source.store);
      expect(layout.pieces.find((piece) => piece.id === 'piece-1')).toMatchObject({
        x: 30,
        y: 25,
      });
      expect(layout.pieces.find((piece) => piece.id === 'piece-splash')).toMatchObject({
        x: 30,
        y: 21,
      });
      expect(layout.dims.find((item) => item.id === 'dim-1')?.offsetPx).toBe(33);
      expect(layout.roomFeatures.find((item) => item.id === 'room-base-1')?.x).toBe(50);
      expect(layout.plan).toMatchObject({ opacity: 0.5, offsetX: 2 });

      const exported = source.lifecycle.exportJson(false);
      target.lifecycle.importJson(exported);
      expect(target.store.getState().project).toEqual(source.store.getState().project);
      expect(target.store.getState().session).toMatchObject({
        activeLayoutId: 'layout-kitchen',
        workspace: 'design',
        selection: { kind: 'none' },
      });
    } finally {
      source.effects.stop(false);
      target.effects.stop(false);
    }
  });

  it('keeps duplicated fabrication/splash families isolated through delete, history, and reload', () => {
    const source = runtime();
    const target = runtime();

    try {
      const original = kitchen(source.store);
      const counters = new Map<string, number>();
      const plan = preparePieceDuplication(
        original,
        ['piece-1'],
        'design',
        (kind) => {
          const next = (counters.get(kind) ?? 0) + 1;
          counters.set(kind, next);
          return `batch80-${kind}-${next}`;
        },
      );
      const copyIds = new Set(plan.copies.map((piece) => piece.id));

      expect(plan.copies).toHaveLength(3);
      const copiedSplash = plan.copies.find(isBacksplashPiece);
      expect(copiedSplash).toBeDefined();
      expect(
        copiedSplash?.attachment &&
          copyIds.has(copiedSplash.attachment.parentPieceId),
      ).toBe(true);
      plan.copies.forEach((piece) => {
        piece.assemblyLinks.forEach((link) => {
          expect(copyIds.has(link.matePieceId)).toBe(true);
        });
      });

      source.commands.execute(duplicatePieces('layout-kitchen', plan));
      expect(kitchen(source.store).pieces).toHaveLength(7);
      copyIds.forEach((id) => {
        expect(kitchen(source.store).pieces.some((piece) => piece.id === id)).toBe(true);
      });

      source.commands.execute(deletePieces('layout-kitchen', ['piece-1']));
      let ids = kitchen(source.store).pieces.map((piece) => piece.id);
      expect(ids).toHaveLength(4);
      expect(ids).toContain('piece-island');
      expect(ids).not.toContain('piece-1');
      expect(ids).not.toContain('piece-cooktop-run');
      expect(ids).not.toContain('piece-splash');
      copyIds.forEach((id) => expect(ids).toContain(id));
      expect(source.effects.history.getStatus()).toMatchObject({
        size: 3,
        index: 2,
        canUndo: true,
      });

      expect(source.effects.history.undo()).toBe(true);
      expect(kitchen(source.store).pieces).toHaveLength(7);
      expect(source.effects.history.undo()).toBe(true);
      expect(kitchen(source.store).pieces).toHaveLength(4);

      expect(source.effects.history.redo()).toBe(true);
      expect(kitchen(source.store).pieces).toHaveLength(7);
      expect(source.effects.history.redo()).toBe(true);
      ids = kitchen(source.store).pieces.map((piece) => piece.id);
      expect(ids).toHaveLength(4);
      copyIds.forEach((id) => expect(ids).toContain(id));

      target.lifecycle.importJson(source.lifecycle.exportJson(false));
      expect(target.store.getState().project).toEqual(source.store.getState().project);
      const reloadedIds = kitchen(target.store).pieces.map((piece) => piece.id);
      expect(reloadedIds).toEqual(ids);
    } finally {
      source.effects.stop(false);
      target.effects.stop(false);
    }
  });

  it('recovers DESIGN and SLAB edits together and keeps output projection non-mutating', () => {
    const storage = new MemoryStorage();
    const source = runtime(storage, 'design');

    source.commands.execute(
      transformPieces('layout-kitchen', [
        {
          id: 'piece-island',
          designPose: { x: 70, y: 90, rotation: 15 },
        },
      ]),
    );
    source.commands.execute(setWorkspace('slab'));
    source.commands.execute(
      transformPieces('layout-kitchen', [
        {
          id: 'piece-island',
          slabPose: { x: 15, y: 18, rotation: 90 },
        },
      ]),
    );
    source.commands.execute(
      updateSlabSurface('layout-kitchen', 'slab-1', {
        x: 9,
        y: 11,
        opacity: 0.75,
      }),
    );

    expect(source.effects.autosave.flush()).toBe(true);
    const savedProject = structuredClone(source.store.getState().project);
    source.effects.stop(false);

    const target = runtime(storage, 'design');
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

      const recoveredLayout = kitchen(target.store);
      expect(recoveredLayout.pieces.find((piece) => piece.id === 'piece-island')).toMatchObject({
        x: 70,
        y: 90,
        rotation: 15,
        slabPlacement: { x: 15, y: 18, rotation: 90 },
      });
      expect(recoveredLayout.overlays.find((slab) => slab.id === 'slab-1')).toMatchObject({
        x: 9,
        y: 11,
        opacity: 0.75,
      });

      const slabProjection = createPieceCanvasProjection(recovered);
      expect(slabProjection.workspace).toBe('slab');
      expect(slabProjection.slabs.map((slab) => slab.id)).toEqual(['slab-1']);

      const outputState = productionOutputStateForLayout(recovered, 'layout-bath');
      expect(outputState.project).toBe(recovered.project);
      expect(outputState.session).toMatchObject({
        activeLayoutId: 'layout-bath',
        selection: { kind: 'none' },
      });
      expect(target.store.getState().session).toMatchObject({
        activeLayoutId: 'layout-kitchen',
        workspace: 'slab',
      });

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
  });
});
