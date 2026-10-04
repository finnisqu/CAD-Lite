import { describe, expect, it } from 'vitest';

import {
  AppStore,
  ApplicationStatePreview,
  applicationStateFromLegacyPayload,
  type ApplicationState,
} from '../src/app';
import { v159ProjectFixture } from './fixtures/v159-project';

function previewState(
  initial: ApplicationState,
  layoutId: string,
): ApplicationState {
  return {
    project: initial.project,
    preferences: initial.preferences,
    session: {
      ...initial.session,
      activeLayoutId: layoutId,
      selection: { kind: 'none' },
      transient: {},
    },
  };
}

function alternateLayoutId(initial: ApplicationState): string {
  const id = initial.project.layouts[1]?.id;
  if (!id) throw new Error('Fixture requires a second layout.');
  return id;
}

describe('application state preview', () => {
  it('restores the exact baseline state after a successful preview', async () => {
    const initial = applicationStateFromLegacyPayload(
      structuredClone(v159ProjectFixture),
    );
    const store = new AppStore(initial);
    const preview = new ApplicationStatePreview(store);
    const layoutId = alternateLayoutId(initial);

    await preview.run(({ replace }) => {
      replace(
        previewState(initial, layoutId),
        'Preview alternate layout',
      );
      expect(store.getState().session.activeLayoutId).toBe(layoutId);
      return Promise.resolve();
    });

    expect(store.getState().project).toBe(initial.project);
    expect(store.getState().preferences).toBe(initial.preferences);
    expect(store.getState().session).toBe(initial.session);
  });

  it('restores the baseline when preview work throws', async () => {
    const initial = applicationStateFromLegacyPayload(
      structuredClone(v159ProjectFixture),
    );
    const store = new AppStore(initial);
    const preview = new ApplicationStatePreview(store);
    const layoutId = alternateLayoutId(initial);

    await expect(
      preview.run(({ replace }) => {
        replace(previewState(initial, layoutId));
        return Promise.reject(new Error('render failed'));
      }),
    ).rejects.toThrow('render failed');

    expect(store.getState().project).toBe(initial.project);
    expect(store.getState().preferences).toBe(initial.preferences);
    expect(store.getState().session).toBe(initial.session);
  });
});
