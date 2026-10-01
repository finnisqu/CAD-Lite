import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  updateProjectScratchpad,
} from '../src/app';
import { deriveViewInvalidations } from '../src/app/effects/invalidation';
import {
  normalizeProjectScratchpad,
  patchProjectScratchpad,
} from '../src/domain/scratchpad';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  return { store, commands: new CommandDispatcher(store) };
}

describe('Batch 28 Project Scratchpad foundation', () => {
  it('normalizes the exact v1.5.99 scratchpad defaults', () => {
    expect(normalizeProjectScratchpad({})).toEqual({
      html: '',
      floating: false,
      dockHeight: 220,
      width: 360,
      height: 300,
      left: null,
      top: null,
    });
  });

  it('retains production geometry limits and HTML/floating semantics', () => {
    expect(
      normalizeProjectScratchpad({
        html: '<b>Field verify</b>',
        floating: 'yes',
        dockHeight: 900,
        width: 20,
        height: -5,
        left: '42.5',
        top: 'bad',
      }),
    ).toEqual({
      html: '<b>Field verify</b>',
      floating: true,
      dockHeight: 420,
      width: 280,
      height: 190,
      left: 42.5,
      top: null,
    });
  });

  it('uses production zero-value fallbacks for scratchpad dimensions', () => {
    expect(
      normalizeProjectScratchpad({
        dockHeight: 0,
        width: 0,
        height: 0,
      }),
    ).toMatchObject({ dockHeight: 220, width: 360, height: 300 });
  });

  it('patches through the same normalizer', () => {
    const initial = normalizeProjectScratchpad({});
    expect(
      patchProjectScratchpad(initial, { width: 999, floating: true }),
    ).toMatchObject({ width: 720, floating: true });
  });

  it('updates project scratchpad without creating CAD Undo history', () => {
    const { store, commands } = setup();
    const historyBefore = store.getHistoryState();
    expect(
      commands.execute(
        updateProjectScratchpad({ html: '<i>Template notes</i>' }),
      ),
    ).not.toBeNull();
    expect(store.getState().project.meta.scratchpad.html).toBe(
      '<i>Template notes</i>',
    );
    expect(store.getHistoryState()).toEqual(historyBefore);
  });

  it('isolates scratchpad-only project invalidation from the CAD surfaces', () => {
    const { store, commands } = setup();
    let event: Parameters<typeof deriveViewInvalidations>[0] | null = null;
    const unsubscribe = store.subscribe((next) => {
      event = next;
    });
    commands.execute(updateProjectScratchpad({ html: 'Measure sink wall' }));
    unsubscribe();
    expect(event).not.toBeNull();
    if (!event) throw new Error('Expected scratchpad store event.');
    expect(deriveViewInvalidations(event)).toEqual(['scratchpad']);
  });
});
