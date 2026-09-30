import type { Selection } from '../state';
import type { AppCommand } from './types';

function sameSelection(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'none' && b.kind === 'none') return true;

  if (a.kind === 'pieces' && b.kind === 'pieces') {
    return a.ids.length === b.ids.length && a.ids.every((id, index) => id === b.ids[index]);
  }

  return 'id' in a && 'id' in b && a.id === b.id;
}

export function setSelection(selection: Selection): AppCommand {
  return {
    type: 'session.setSelection',
    label: 'Change selection',
    history: 'skip',
    persistence: 'skip',
    reduce(state) {
      if (sameSelection(state.session.selection, selection)) {
        return state;
      }

      return {
        ...state,
        session: {
          ...state.session,
          selection,
        },
      };
    },
  };
}

export function setActiveLayout(layoutId: string): AppCommand {
  return {
    type: 'session.setActiveLayout',
    label: 'Switch layout',
    history: 'skip',
    persistence: 'save',
    reduce(state) {
      if (!state.project.layouts.some((layout) => layout.id === layoutId)) {
        return state;
      }

      if (
        state.session.activeLayoutId === layoutId &&
        state.session.selection.kind === 'layout' &&
        state.session.selection.id === layoutId
      ) {
        return state;
      }

      return {
        ...state,
        session: {
          ...state.session,
          activeLayoutId: layoutId,
          selection: { kind: 'layout', id: layoutId },
          transient: {},
        },
      };
    },
  };
}

export function setWorkspace(workspace: 'design' | 'slab'): AppCommand {
  return {
    type: 'session.setWorkspace',
    label: workspace === 'slab' ? 'Switch to SLAB workspace' : 'Switch to DESIGN workspace',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      if (state.session.workspace === workspace) {
        return state;
      }

      return {
        ...state,
        session: {
          ...state.session,
          workspace,
          transient: {},
        },
      };
    },
  };
}
