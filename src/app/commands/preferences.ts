import type { EditorPreferences } from '../../persistence';
import { normalizeEditorPreferences } from '../../persistence';
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
      const next = normalizeEditorPreferences({
        ...state.preferences,
        ...patch,
      });

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
