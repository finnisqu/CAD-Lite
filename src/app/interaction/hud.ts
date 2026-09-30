import { TOOL_DEFINITIONS } from './definitions';
import type { InteractionState, ToolId, ToolScope } from './types';

export interface ToolHudModel {
  visible: boolean;
  toolId: ToolId | null;
  title: string;
  locked: boolean;
  lockable: boolean;
  scope: ToolScope | null;
  scopeEnabled: boolean;
  returnsToParent: boolean;
  parentToolId: ToolId | null;
}

export function getToolHudModel(interaction: InteractionState): ToolHudModel {
  const active = interaction.activeTool;

  if (!active) {
    return {
      visible: false,
      toolId: null,
      title: '',
      locked: false,
      lockable: false,
      scope: null,
      scopeEnabled: false,
      returnsToParent: false,
      parentToolId: null,
    };
  }

  const definition = TOOL_DEFINITIONS[active.id];
  const lockable =
    definition.activation === 'locked-only' ||
    definition.activation === 'momentary-lockable';

  return {
    visible: true,
    toolId: active.id,
    title: definition.title,
    locked: active.activation === 'locked',
    lockable,
    scope: active.scope,
    scopeEnabled: definition.defaultScope !== undefined,
    returnsToParent: definition.parentTool !== undefined,
    parentToolId: definition.parentTool ?? null,
  };
}
