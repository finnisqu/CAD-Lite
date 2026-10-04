import { describe, expect, it } from 'vitest';

import {
  clearPointerInteraction,
  interactionWithPointer,
  pointerSessionFromInput,
} from '../src/app/interaction/pointer-session';
import { createDefaultInteractionState } from '../src/app/interaction/state';
import type { ToolPointerInput } from '../src/app/interaction/types';

function pointer(
  x: number,
  y: number,
  options: Partial<ToolPointerInput> = {},
): ToolPointerInput {
  return {
    pointerId: options.pointerId ?? 7,
    x,
    y,
    button: options.button ?? 0,
    buttons: options.buttons ?? 1,
    modifiers: {
      shift: options.modifiers?.shift ?? false,
      alt: options.modifiers?.alt ?? false,
      ctrl: options.modifiers?.ctrl ?? false,
      meta: options.modifiers?.meta ?? false,
    },
  };
}

describe('pointer interaction lifecycle helpers', () => {
  it('creates a pointer snapshot with a stable session start', () => {
    const input = pointer(14, 19, {
      pointerId: 3,
      buttons: 5,
      modifiers: { shift: true, alt: false, ctrl: true, meta: false },
    });

    expect(pointerSessionFromInput({ x: 10, y: 11 }, input)).toEqual({
      pointerId: 3,
      startX: 10,
      startY: 11,
      x: 14,
      y: 19,
      buttons: 5,
      modifiers: { shift: true, alt: false, ctrl: true, meta: false },
    });
  });

  it('updates pointer and preview without disturbing other interaction state', () => {
    const interaction = {
      ...createDefaultInteractionState(),
      hud: { left: 12, top: 18, userMoved: true },
      toolMemory: { note: { sticky: true } },
    };
    const preview = { kind: 'preview', id: 'example' };

    const next = interactionWithPointer(
      interaction,
      { x: 2, y: 4 },
      pointer(7, 9),
      preview,
    );

    expect(next.pointer).toMatchObject({
      startX: 2,
      startY: 4,
      x: 7,
      y: 9,
    });
    expect(next.preview).toEqual(preview);
    expect(next.hud).toBe(interaction.hud);
    expect(next.toolMemory).toBe(interaction.toolMemory);
  });

  it('clears pointer and preview while preserving tool and HUD state', () => {
    const interaction = interactionWithPointer(
      createDefaultInteractionState(),
      { x: 1, y: 2 },
      pointer(3, 4),
      { kind: 'preview' },
    );

    const cleared = clearPointerInteraction(interaction);
    expect(cleared.pointer).toBeNull();
    expect(cleared.preview).toBeNull();
    expect(cleared.activeTool).toBe(interaction.activeTool);
    expect(cleared.hud).toBe(interaction.hud);
    expect(cleared.toolMemory).toBe(interaction.toolMemory);
    expect(clearPointerInteraction(cleared)).toBe(cleared);
  });
});
