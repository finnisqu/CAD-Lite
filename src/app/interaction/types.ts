import type { JsonObject, JsonValue } from '../../domain/types';
import type { Workspace } from '../../persistence';
import type { AppCommand } from '../commands/types';
import type { ReadonlyApplicationState } from '../state';

export type ToolId =
  | 'splash'
  | 'radius'
  | 'edgePainter'
  | 'dimension'
  | 'note'
  | 'line'
  | 'slabMove'
  | 'roomFeatures'
  | 'roomWall'
  | 'linkedWall';

export type ToolActivation = 'momentary' | 'locked';
export type ToolActivationCapability =
  | 'momentary-only'
  | 'locked-only'
  | 'momentary-lockable';

export type ToolScope = 'selected' | 'all';

export interface ToolDefinition {
  id: ToolId;
  family: string;
  title: string;
  allowedWorkspaces: readonly Workspace[];
  activation: ToolActivationCapability;
  shortcut?: string;
  parentTool?: ToolId;
  defaultScope?: ToolScope;
  dismissOnEnter?: boolean;
}

export interface ActiveToolSession {
  id: ToolId;
  activation: ToolActivation;
  heldKey: string | null;
  scope: ToolScope | null;
  options: JsonObject;
}

export interface PointerModifiers {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
}

export interface ToolPointerInput {
  pointerId: number;
  x: number;
  y: number;
  button: number;
  buttons: number;
  modifiers: PointerModifiers;
}

export interface PointerSession {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  buttons: number;
  modifiers: PointerModifiers;
}

export interface ModeHudState {
  left: number | null;
  top: number | null;
  userMoved: boolean;
}

export interface InteractionState {
  activeTool: ActiveToolSession | null;
  pointer: PointerSession | null;
  preview: JsonValue;
  hud: ModeHudState;
  toolMemory: Partial<Record<ToolId, JsonObject>>;
}

export interface ToolInputResult {
  preview?: JsonValue;
  commands?: readonly AppCommand[];
  transactionLabel?: string;
  cancel?: boolean;
}

export interface ToolHandlerContext {
  state: ReadonlyApplicationState;
  tool: ActiveToolSession;
}

export interface ToolHandler {
  onActivate?(context: ToolHandlerContext): ToolInputResult | void;
  onDeactivate?(context: ToolHandlerContext): void;
  onCancel?(context: ToolHandlerContext): void;
  onPointerDown?(context: ToolHandlerContext, input: ToolPointerInput): ToolInputResult | void;
  onPointerMove?(context: ToolHandlerContext, input: ToolPointerInput): ToolInputResult | void;
  onPointerUp?(context: ToolHandlerContext, input: ToolPointerInput): ToolInputResult | void;
}

export interface ToolKeyInput {
  key: string;
  repeat?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}
