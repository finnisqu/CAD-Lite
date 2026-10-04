import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  HistoryManager,
  applicationStateFromLegacyPayload,
  updateLayoutViewport,
} from '../src/app';
import {
  nextProductionCanvasScale,
  resolveProductionTheme,
} from '../src/browser';
import { v159ProjectFixture } from './fixtures/v159-project';

describe('production viewport helpers', () => {
  it('steps zoom in production 0.5 px/in increments', () => {
    expect(nextProductionCanvasScale(6, 1)).toBe(6.5);
    expect(nextProductionCanvasScale(6, -1)).toBe(5.5);
  });

  it('clamps zoom to the v1.5.99 production range', () => {
    expect(nextProductionCanvasScale(24, 1)).toBe(24);
    expect(nextProductionCanvasScale(1, -1)).toBe(1);
  });

  it('coalesces preview zooms into one undoable final history entry', () => {
    const store = new AppStore(
      applicationStateFromLegacyPayload(structuredClone(v159ProjectFixture)),
    );
    const commands = new CommandDispatcher(store);
    const history = new HistoryManager(store);
    history.start();

    const layoutId = 'layout-kitchen';
    const startScale = store.getState().project.layouts[0]!.scale;

    commands.execute(
      updateLayoutViewport(
        layoutId,
        { scale: 6.5 },
        { history: 'skip', persistence: 'skip' },
      ),
    );
    commands.execute(
      updateLayoutViewport(
        layoutId,
        { scale: 7 },
        { history: 'skip', persistence: 'skip' },
      ),
    );

    expect(store.getState().project.layouts[0]!.scale).toBe(7);
    expect(history.getStatus()).toMatchObject({ size: 1, index: 0 });

    commands.execute(
      updateLayoutViewport(
        layoutId,
        { scale: startScale },
        { history: 'skip', persistence: 'skip' },
      ),
    );
    commands.execute(
      updateLayoutViewport(layoutId, { scale: 7 }, { label: 'Zoom canvas' }),
    );

    expect(history.getStatus()).toMatchObject({
      size: 2,
      index: 1,
      canUndo: true,
      undoLabel: 'Zoom canvas',
    });
    expect(history.undo()).toBe(true);
    expect(store.getState().project.layouts[0]!.scale).toBe(startScale);
    expect(history.redo()).toBe(true);
    expect(store.getState().project.layouts[0]!.scale).toBe(7);
  });

  it('resolves Light, Dark, and System appearance choices', () => {
    expect(resolveProductionTheme('light', true)).toBe('light');
    expect(resolveProductionTheme('dark', false)).toBe('dark');
    expect(resolveProductionTheme('system', true)).toBe('dark');
    expect(resolveProductionTheme('system', false)).toBe('light');
  });
});
