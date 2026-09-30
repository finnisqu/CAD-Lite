import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  applicationStateFromLegacyPayload,
  cadLiteFileFromApplicationState,
  setSelection,
  setWorkspace,
} from '../src/app';
import {
  serializeCadLiteFile,
} from '../src/persistence';
import { v159ProjectFixture } from './fixtures/v159-project';

describe('application/persistence bridge', () => {
  it('hydrates Project, Session, and Preferences from a v1.5.99 payload', () => {
    const state = applicationStateFromLegacyPayload(v159ProjectFixture);

    expect(state.project.meta.name).toBe('Architecture Test');
    expect(state.session.activeLayoutId).toBe('layout-bath');
    expect(state.session.workspace).toBe('slab');
    expect(state.session.selection).toEqual({ kind: 'none' });
    expect(state.preferences.dimPrecision).toBe(16);
  });

  it('does not serialize transient selection', () => {
    const store = new AppStore(applicationStateFromLegacyPayload(v159ProjectFixture));
    const commands = new CommandDispatcher(store);

    commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));
    commands.execute(setWorkspace('design'));

    const file = cadLiteFileFromApplicationState(
      store.getState() as Parameters<typeof cadLiteFileFromApplicationState>[0],
    );
    const json = serializeCadLiteFile(file);

    expect(json).not.toContain('piece-1');
    expect(json).not.toContain('selection');
    expect(file.editor.workspace).toBe('design');
  });

  it('keeps active layout and editor preferences in the editor section', () => {
    const state = applicationStateFromLegacyPayload(v159ProjectFixture);
    const file = cadLiteFileFromApplicationState(state);

    expect(file.project).toBeDefined();
    expect(file.editor.activeLayoutId).toBe('layout-bath');
    expect(file.editor.preferences.edgeLabelMode).toBe('symbol');
  });
});
