import type { JsonValue } from '../../domain/types';
import type { Workspace } from '../../persistence';
import type { CommandDispatcher } from '../commands';
import { replaceInteractionState, setWorkspace } from '../commands/session';
import type { AppStore } from '../store';
import {
  TOOL_DEFINITIONS,
  getToolDefinition,
  toolAllowedInWorkspace,
  toolSupportsLock,
  toolSupportsMomentary,
} from './definitions';
import { resetActiveInteraction } from './state';
import type {
  ActiveToolSession,
  InteractionState,
  PointerModifiers,
  ToolHandler,
  ToolHandlerContext,
  ToolId,
  ToolInputResult,
  ToolKeyInput,
  ToolPointerInput,
  ToolScope,
} from './types';

const DESIGN_SHORTCUTS: Readonly<Record<string, ToolId>> = {
  s: 'splash',
  r: 'radius',
  e: 'edgePainter',
  d: 'dimension',
  n: 'note',
  l: 'line',
};

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

function modifiers(input: ToolPointerInput): PointerModifiers {
  return {
    shift: input.modifiers.shift,
    alt: input.modifiers.alt,
    ctrl: input.modifiers.ctrl,
    meta: input.modifiers.meta,
  };
}

function sameToolFamily(a: ToolId, b: ToolId): boolean {
  return TOOL_DEFINITIONS[a].family === TOOL_DEFINITIONS[b].family;
}

export class ToolController {
  private readonly handlers = new Map<ToolId, ToolHandler>();

  constructor(
    private readonly store: AppStore,
    private readonly commands: CommandDispatcher,
  ) {}

  register(toolId: ToolId, handler: ToolHandler): () => void {
    this.handlers.set(toolId, handler);
    return () => {
      if (this.handlers.get(toolId) === handler) this.handlers.delete(toolId);
    };
  }

  getActiveTool(): ActiveToolSession | null {
    return this.store.getState().session.interaction.activeTool;
  }

  isActive(toolId: ToolId): boolean {
    let current = this.getActiveTool()?.id ?? null;

    while (current) {
      if (current === toolId) return true;
      current = TOOL_DEFINITIONS[current].parentTool ?? null;
    }

    return false;
  }

  activateHeld(toolId: ToolId, key: string): boolean {
    if (!toolSupportsMomentary(toolId)) return false;
    if (!this.canActivate(toolId)) return false;

    const normalizedKey = normalizeKey(key);
    const next = this.makeActiveInteraction(toolId, 'momentary', normalizedKey);
    return this.activate(next);
  }

  activateLocked(toolId: ToolId): boolean {
    if (!toolSupportsLock(toolId)) return false;
    if (!this.canActivate(toolId)) return false;

    const next = this.makeActiveInteraction(toolId, 'locked', null);
    return this.activate(next);
  }

  toggleLocked(toolId: ToolId): boolean {
    if (!toolSupportsLock(toolId)) return false;
    if (!this.canActivate(toolId)) return false;

    const active = this.getActiveTool();
    if (active?.activation === 'locked' && sameToolFamily(active.id, toolId)) {
      return this.cancel();
    }

    return this.activateLocked(toolId);
  }

  promoteHeldToLocked(): boolean {
    const active = this.getActiveTool();
    if (!active || active.activation !== 'momentary' || !toolSupportsLock(active.id)) {
      return false;
    }

    const interaction = this.store.getState().session.interaction;
    this.commitInteraction({
      ...interaction,
      activeTool: {
        ...active,
        activation: 'locked',
        heldKey: null,
      },
    });

    return true;
  }

  releaseHeld(key?: string): boolean {
    const active = this.getActiveTool();
    if (!active || active.activation !== 'momentary') return false;

    if (key && active.heldKey !== normalizeKey(key)) return false;
    return this.deactivateTo(null, false);
  }

  cancel(): boolean {
    const active = this.getActiveTool();
    if (!active) return false;

    const definition = getToolDefinition(active.id);
    const parent = definition.parentTool;

    if (parent) {
      const next = this.makeActiveInteraction(parent, 'locked', null);
      return this.deactivateTo(next.activeTool, true);
    }

    return this.deactivateTo(null, true);
  }

  setScope(scope: ToolScope): boolean {
    const active = this.getActiveTool();
    if (!active) return false;

    const definition = getToolDefinition(active.id);
    if (definition.defaultScope === undefined) return false;
    if (active.scope === scope) return false;

    const interaction = this.store.getState().session.interaction;
    this.commitInteraction({
      ...interaction,
      activeTool: {
        ...active,
        scope,
      },
    });

    return true;
  }

  setToolOption(key: string, value: JsonValue): boolean {
    const active = this.getActiveTool();
    if (!active) return false;

    const interaction = this.store.getState().session.interaction;
    const options = {
      ...active.options,
      [key]: value,
    };

    this.commitInteraction({
      ...interaction,
      activeTool: {
        ...active,
        options,
      },
      toolMemory: {
        ...interaction.toolMemory,
        [active.id]: options,
      },
    });

    return true;
  }

  setHudPosition(left: number, top: number): void {
    const interaction = this.store.getState().session.interaction;
    this.commitInteraction({
      ...interaction,
      hud: {
        left,
        top,
        userMoved: true,
      },
    });
  }

  resetHudPosition(): void {
    const interaction = this.store.getState().session.interaction;
    this.commitInteraction({
      ...interaction,
      hud: {
        left: null,
        top: null,
        userMoved: false,
      },
    });
  }

  pointerDown(input: ToolPointerInput): boolean {
    return this.handlePointer('onPointerDown', input, true, false);
  }

  pointerMove(input: ToolPointerInput): boolean {
    return this.handlePointer('onPointerMove', input, false, false);
  }

  pointerUp(input: ToolPointerInput): boolean {
    return this.handlePointer('onPointerUp', input, false, true);
  }

  handleKeyDown(input: ToolKeyInput): boolean {
    if (input.repeat || input.ctrlKey || input.metaKey || input.altKey) return false;

    const key = normalizeKey(input.key);
    const active = this.getActiveTool();

    if (key === 'escape') return this.cancel();

    if (key === 'enter' && active && getToolDefinition(active.id).dismissOnEnter) {
      return this.cancel();
    }

    const workspace = this.store.getState().session.workspace;

    if (key === 'q' && !input.shiftKey && workspace === 'design') {
      if (this.isActive('roomFeatures')) return this.exitRoomFeatures();
      return this.activateLocked('roomFeatures');
    }

    if (workspace === 'slab') {
      if (key !== 's' || input.shiftKey) return false;
      return this.activateHeld('slabMove', key);
    }

    if (key === 'w') {
      return input.shiftKey
        ? this.toggleLocked('linkedWall')
        : this.activateHeld('linkedWall', key);
    }

    const toolId = DESIGN_SHORTCUTS[key];
    if (!toolId) return false;

    return input.shiftKey
      ? this.toggleLocked(toolId)
      : this.activateHeld(toolId, key);
  }

  handleKeyUp(input: Pick<ToolKeyInput, 'key'>): boolean {
    return this.releaseHeld(input.key);
  }

  toggleWorkspace(): boolean {
    const workspace = this.store.getState().session.workspace;
    const next: Workspace = workspace === 'slab' ? 'design' : 'slab';
    return this.commands.execute(setWorkspace(next)) !== null;
  }

  private exitRoomFeatures(): boolean {
    if (!this.isActive('roomFeatures')) return false;

    const active = this.getActiveTool();
    if (active?.id !== 'roomFeatures') {
      const interaction = this.store.getState().session.interaction;
      this.commitInteraction({
        ...interaction,
        activeTool: this.makeSession('roomFeatures', 'locked', null, interaction),
        pointer: null,
        preview: null,
      });
      return true;
    }

    return this.cancel();
  }

  private canActivate(toolId: ToolId): boolean {
    return toolAllowedInWorkspace(toolId, this.store.getState().session.workspace);
  }

  private makeActiveInteraction(
    toolId: ToolId,
    activation: 'momentary' | 'locked',
    heldKey: string | null,
  ): InteractionState {
    const interaction = this.store.getState().session.interaction;

    return {
      ...interaction,
      activeTool: this.makeSession(toolId, activation, heldKey, interaction),
      pointer: null,
      preview: null,
    };
  }

  private makeSession(
    toolId: ToolId,
    activation: 'momentary' | 'locked',
    heldKey: string | null,
    interaction: InteractionState,
  ): ActiveToolSession {
    const definition = getToolDefinition(toolId);
    const remembered = interaction.toolMemory[toolId] ?? {};

    return {
      id: toolId,
      activation,
      heldKey,
      scope: definition.defaultScope ?? null,
      options: { ...remembered },
    };
  }

  private activate(next: InteractionState): boolean {
    const previous = this.getActiveTool();
    if (
      previous &&
      next.activeTool &&
      previous.id === next.activeTool.id &&
      previous.activation === next.activeTool.activation &&
      previous.heldKey === next.activeTool.heldKey
    ) {
      return true;
    }

    if (previous) this.callDeactivate(previous);

    const event = this.commands.execute(replaceInteractionState(next));
    const active = next.activeTool;
    if (event && active) this.applyResult(this.callActivate(active), 'Activate tool');
    return event !== null;
  }

  private deactivateTo(nextTool: ActiveToolSession | null, cancelled: boolean): boolean {
    const interaction = this.store.getState().session.interaction;
    const current = interaction.activeTool;
    if (!current) return false;

    if (cancelled) this.callCancel(current);
    this.callDeactivate(current);

    const next: InteractionState = {
      ...interaction,
      activeTool: nextTool,
      pointer: null,
      preview: null,
    };

    const event = this.commands.execute(replaceInteractionState(next));
    if (event && nextTool) this.applyResult(this.callActivate(nextTool), 'Return to parent tool');
    return event !== null;
  }

  private handlePointer(
    hook: 'onPointerDown' | 'onPointerMove' | 'onPointerUp',
    input: ToolPointerInput,
    beginPointer: boolean,
    endPointer: boolean,
  ): boolean {
    const active = this.getActiveTool();
    if (!active) return false;

    const interaction = this.store.getState().session.interaction;
    const currentPointer = interaction.pointer;
    const pointer = endPointer
      ? null
      : {
          pointerId: input.pointerId,
          startX: beginPointer || !currentPointer ? input.x : currentPointer.startX,
          startY: beginPointer || !currentPointer ? input.y : currentPointer.startY,
          x: input.x,
          y: input.y,
          buttons: input.buttons,
          modifiers: modifiers(input),
        };

    let next: InteractionState = {
      ...interaction,
      pointer,
    };

    const handler = this.handlers.get(active.id);
    const context = this.context(active);
    const result = handler?.[hook]?.(context, input);

    if (result && 'preview' in result) {
      next = {
        ...next,
        preview: result.preview ?? null,
      };
    } else if (endPointer) {
      next = {
        ...next,
        preview: null,
      };
    }

    return this.applyPointerResult(next, result, hook);
  }

  private applyPointerResult(
    next: InteractionState,
    result: ToolInputResult | void,
    hook: string,
  ): boolean {
    const interactionCommand = replaceInteractionState(
      result?.cancel ? resetActiveInteraction(next) : next,
    );
    const domainCommands = result?.commands ? [...result.commands] : [];

    if (domainCommands.length > 0) {
      const event = this.commands.executeTransaction(
        result?.transactionLabel ?? `Tool ${hook}`,
        [...domainCommands, interactionCommand],
      );
      return event !== null;
    }

    const changed = this.commands.execute(interactionCommand) !== null;
    if (result?.cancel) return true;
    return changed || result !== undefined;
  }

  private applyResult(result: ToolInputResult | void, fallbackLabel: string): void {
    if (!result) return;

    const interaction = this.store.getState().session.interaction;
    let next = interaction;

    if ('preview' in result) {
      next = {
        ...next,
        preview: result.preview ?? null,
      };
    }

    const commands = result.commands ? [...result.commands] : [];
    if (result.cancel) {
      next = resetActiveInteraction(interaction);
    }

    const interactionCommand = replaceInteractionState(next);

    if (commands.length > 0) {
      this.commands.executeTransaction(
        result.transactionLabel ?? fallbackLabel,
        [...commands, interactionCommand],
      );
    } else {
      this.commands.execute(interactionCommand);
    }
  }

  private context(tool: ActiveToolSession): ToolHandlerContext {
    return {
      state: this.store.getState(),
      tool,
    };
  }

  private callActivate(tool: ActiveToolSession): ToolInputResult | void {
    return this.handlers.get(tool.id)?.onActivate?.(this.context(tool));
  }

  private callDeactivate(tool: ActiveToolSession): void {
    this.handlers.get(tool.id)?.onDeactivate?.(this.context(tool));
  }

  private callCancel(tool: ActiveToolSession): void {
    this.handlers.get(tool.id)?.onCancel?.(this.context(tool));
  }

  private commitInteraction(next: InteractionState): void {
    this.commands.execute(replaceInteractionState(next));
  }
}
