import { resetActiveInteraction } from '../interaction/state';
import type { InteractionState } from '../interaction/types';
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

export function replaceInteractionState(interaction: InteractionState): AppCommand {
  return {
    type: 'session.replaceInteraction',
    label: 'Update tool interaction',
    history: 'skip',
    persistence: 'skip',
    reduce(state) {
      if (state.session.interaction === interaction) return state;

      return {
        ...state,
        session: {
          ...state.session,
          interaction,
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
        state.session.selection.id === layoutId &&
        state.session.interaction.activeTool === null
      ) {
        return state;
      }

      return {
        ...state,
        session: {
          ...state.session,
          activeLayoutId: layoutId,
          selection: { kind: 'layout', id: layoutId },
          interaction: resetActiveInteraction(state.session.interaction),
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

      const selection =
        state.session.selection.kind === 'pieces'
          ? state.session.selection
          : { kind: 'none' as const };

      return {
        ...state,
        session: {
          ...state.session,
          workspace,
          selection,
          interaction: resetActiveInteraction(state.session.interaction),
          transient: {},
        },
      };
    },
  };
}
