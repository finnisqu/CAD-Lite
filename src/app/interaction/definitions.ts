import type { ToolDefinition, ToolId } from './types';

export const TOOL_DEFINITIONS: Readonly<Record<ToolId, ToolDefinition>> = {
  splash: {
    id: 'splash',
    family: 'splash',
    title: 'SPLASH',
    allowedWorkspaces: ['design'],
    activation: 'momentary-lockable',
    shortcut: 's',
    defaultScope: 'all',
    dismissOnEnter: true,
  },
  radius: {
    id: 'radius',
    family: 'radius',
    title: 'RADIUS LABELS',
    allowedWorkspaces: ['design'],
    activation: 'momentary-lockable',
    shortcut: 'r',
    defaultScope: 'all',
    dismissOnEnter: true,
  },
  edgePainter: {
    id: 'edgePainter',
    family: 'edgePainter',
    title: 'EDGE PAINTER',
    allowedWorkspaces: ['design'],
    activation: 'momentary-lockable',
    shortcut: 'e',
    defaultScope: 'all',
    dismissOnEnter: true,
  },
  dimension: {
    id: 'dimension',
    family: 'dimension',
    title: 'DIMENSION',
    allowedWorkspaces: ['design'],
    activation: 'momentary-lockable',
    shortcut: 'd',
    dismissOnEnter: true,
  },
  note: {
    id: 'note',
    family: 'note',
    title: 'NOTE',
    allowedWorkspaces: ['design'],
    activation: 'momentary-lockable',
    shortcut: 'n',
    dismissOnEnter: true,
  },
  line: {
    id: 'line',
    family: 'line',
    title: 'LINE',
    allowedWorkspaces: ['design'],
    activation: 'momentary-lockable',
    shortcut: 'l',
    dismissOnEnter: true,
  },
  slabMove: {
    id: 'slabMove',
    family: 'slabMove',
    title: 'SLAB MOVE',
    allowedWorkspaces: ['slab'],
    activation: 'momentary-only',
    shortcut: 's',
  },
  roomFeatures: {
    id: 'roomFeatures',
    family: 'roomFeatures',
    title: 'ROOM FEATURES',
    allowedWorkspaces: ['design'],
    activation: 'locked-only',
  },
  roomWall: {
    id: 'roomWall',
    family: 'roomWall',
    title: 'WALL',
    allowedWorkspaces: ['design'],
    activation: 'momentary-lockable',
    parentTool: 'roomFeatures',
  },
  linkedWall: {
    id: 'linkedWall',
    family: 'linkedWall',
    title: 'LINKED WALLS',
    allowedWorkspaces: ['design'],
    activation: 'momentary-lockable',
    shortcut: 'w',
    parentTool: 'roomFeatures',
  },
};

export function getToolDefinition(toolId: ToolId): ToolDefinition {
  return TOOL_DEFINITIONS[toolId];
}

export function toolAllowedInWorkspace(toolId: ToolId, workspace: 'design' | 'slab'): boolean {
  return TOOL_DEFINITIONS[toolId].allowedWorkspaces.includes(workspace);
}

export function toolSupportsMomentary(toolId: ToolId): boolean {
  const activation = TOOL_DEFINITIONS[toolId].activation;
  return activation === 'momentary-only' || activation === 'momentary-lockable';
}

export function toolSupportsLock(toolId: ToolId): boolean {
  const activation = TOOL_DEFINITIONS[toolId].activation;
  return activation === 'locked-only' || activation === 'momentary-lockable';
}
