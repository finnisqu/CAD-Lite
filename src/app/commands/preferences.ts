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
      let next = normalizeEditorPreferences({
        ...state.preferences,
        ...patch,
      });

      // v1.5.99 stores visibility/display toggles independently for DESIGN and
      // SLAB. Keep that behavior centralized instead of making every toolbar or
      // View-menu control remember to update workspaceViews itself.
      if (workspaceViewPatchTouches(patch)) {
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
