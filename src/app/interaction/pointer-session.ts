import type { JsonValue } from '../../domain/types';
import type {
  InteractionState,
  PointerSession,
  ToolPointerInput,
} from './types';

export interface PointerStart {
  x: number;
  y: number;
}

export function pointerSessionFromInput(
  start: PointerStart,
  input: ToolPointerInput,
): PointerSession {
  return {
    pointerId: input.pointerId,
    startX: start.x,
    startY: start.y,
    x: input.x,
    y: input.y,
    buttons: input.buttons,
    modifiers: { ...input.modifiers },
  };
}

export function interactionWithPointer(
  interaction: InteractionState,
  start: PointerStart,
  input: ToolPointerInput,
  preview: JsonValue = interaction.preview,
): InteractionState {
  return {
    ...interaction,
    pointer: pointerSessionFromInput(start, input),
    preview,
  };
}

export function clearPointerInteraction(
  interaction: InteractionState,
): InteractionState {
  if (!interaction.pointer && interaction.preview === null) {
    return interaction;
  }

  return {
    ...interaction,
    pointer: null,
    preview: null,
  };
}
