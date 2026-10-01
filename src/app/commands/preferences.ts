import type { EditorPreferences } from '../../persistence';
import {
  normalizeEditorPreferences,
  saveWorkspaceView,
  workspaceViewPatchTouches,
} from '../../persistence';
import type { AppCommand } from './types';

function preferencesEqual(a: EditorPreferences, b: EditorPreferences): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function updatePreferences(patch: Partial<EditorPreferences>): AppCommand {
  return {
    type: 'preferences.update',
    label: 'Update editor preferences',
    history: 'skip',
    persistence: 'save',
    reduce(state) {
      const workspaceViewChange = workspaceViewPatchTouches(patch);
      // Production initializes both workspace buckets from the pre-toggle state,
      // then writes the changed visibility into only the active workspace.
      const current = workspaceViewChange
        ? saveWorkspaceView(state.preferences, state.session.workspace)
        : state.preferences;
      let next = normalizeEditorPreferences({
        ...current,
        ...patch,
      });

      // Keep workspace-view persistence centralized instead of making every
      // toolbar or View-menu control remember to update workspaceViews itself.
      if (workspaceViewChange) {
        next = saveWorkspaceView(next, state.session.workspace);
      }

      if (preferencesEqual(state.preferences, next)) {
        return state;
      }

      return {
        ...state,
        preferences: next,
      };
    },
  };
}
