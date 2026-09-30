import type { InteractionState, ToolId } from './types';

export function createDefaultInteractionState(): InteractionState {
  return {
    activeTool: null,
    pointer: null,
    preview: null,
    hud: {
      left: null,
      top: null,
      userMoved: false,
    },
    toolMemory: {},
  };
}

export function resetActiveInteraction(state: InteractionState): InteractionState {
  if (!state.activeTool && !state.pointer && state.preview === null) return state;

  return {
    ...state,
    activeTool: null,
    pointer: null,
    preview: null,
  };
}

export function activeToolIncludes(
  activeToolId: ToolId | null | undefined,
  requestedToolId: ToolId,
  parentByTool: Partial<Record<ToolId, ToolId>>,
): boolean {
  let current = activeToolId ?? null;

  while (current) {
    if (current === requestedToolId) return true;
    current = parentByTool[current] ?? null;
  }

  return false;
}
