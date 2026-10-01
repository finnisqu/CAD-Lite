import {
  patchProjectScratchpad,
  sameProjectScratchpad,
  type ProjectScratchpadPatch,
} from '../../domain/scratchpad';
import type { AppCommand } from './types';

export function updateProjectScratchpad(
  patch: ProjectScratchpadPatch,
): AppCommand {
  return {
    type: 'project.updateScratchpad',
    label: 'Update project scratchpad',
    history: 'skip',
    persistence: 'save',
    reduce(state) {
      const current = state.project.meta.scratchpad;
      const next = patchProjectScratchpad(current, patch);
      if (sameProjectScratchpad(current, next)) return state;

      return {
        ...state,
        project: {
          ...state.project,
          meta: {
            ...state.project.meta,
            scratchpad: next,
          },
        },
      };
    },
  };
}
