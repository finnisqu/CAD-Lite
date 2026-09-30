import { describe, expect, it } from 'vitest';

import {
  AnnotationInteractionController,
  AppStore,
  CommandDispatcher,
  addCanvasNote,
  addNoteLeader,
  applicationStateFromLegacyPayload,
} from '../src/app';
import {
  createCanvasNote,
  createNoteLeaderLine,
} from '../src/domain/annotations';
import type { ToolPointerInput } from '../src/app/interaction';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const payload = structuredClone(v159ProjectFixture);
  if (!payload.ui || typeof payload.ui !== 'object' || Array.isArray(payload.ui)) {
    throw new Error('Fixture UI shape changed');
  }
  payload.ui.workspace = 'layout';
  payload.active = 0;

  const store = new AppStore(applicationStateFromLegacyPayload(payload));
  const commands = new CommandDispatcher(store);
  const interaction = new AnnotationInteractionController(store, commands);
  return { store, commands, interaction };
}

function pointer(
  x: number,
  y: number,
  options: Partial<ToolPointerInput> = {},
): ToolPointerInput {
  return {
    pointerId: 1,
    x,
    y,
    button: 0,
    buttons: 1,
    modifiers: {
      shift: false,
      alt: true,
      ctrl: false,
      meta: false,
      ...(options.modifiers ?? {}),
    },
    ...options,
  };
}

describe('Batch 22 annotation editing interactions', () => {
  it('weakly straightens an existing Dimension endpoint within 3 degrees', () => {
    const { store, interaction } = setup();

    expect(
      interaction.beginDimensionEndpoint(
        'dim-1',
        'end',
        pointer(121, 30),
      ),
    ).toBe(true);

    interaction.pointerMove(pointer(121, 33));
    interaction.pointerUp(pointer(121, 33, { buttons: 0 }));

    expect(store.getState().project.layouts[0]?.dims[0]).toMatchObject({
      x1: 25,
      y1: 30,
      x2: 121,
      y2: 30,
    });
  });

  it('uses Shift as a strong H/V constraint when editing an endpoint', () => {
    const { store, interaction } = setup();

    interaction.beginDimensionEndpoint(
      'dim-1',
      'end',
      pointer(121, 30),
    );
    const input = pointer(75, 55, {
      modifiers: {
        shift: true,
        alt: true,
        ctrl: false,
        meta: false,
      },
    });
    interaction.pointerMove(input);
    interaction.pointerUp({ ...input, buttons: 0 });

    expect(store.getState().project.layouts[0]?.dims[0]).toMatchObject({
      x2: 75,
      y2: 30,
    });
  });

  it('stores Dimension label drag as a signed screen-pixel offset', () => {
    const { store, interaction } = setup();

    interaction.beginDimensionOffset('dim-1', pointer(73, 30));
    interaction.pointerMove(pointer(73, 35));
    interaction.pointerUp(pointer(73, 35, { buttons: 0 }));

    expect(store.getState().project.layouts[0]?.dims[0]?.offsetPx).toBe(30);
  });

  it('moves a Note and its attached leader atomically through the Note command', () => {
    const { store, commands, interaction } = setup();
    const layoutId = 'layout-kitchen';
    const note = createCanvasNote(
      'note-drag',
      { x: 40, y: 50 },
      'Move me',
    );
    commands.execute(addCanvasNote(layoutId, note));
    commands.execute(
      addNoteLeader(
        layoutId,
        note.id,
        createNoteLeaderLine(
          'leader-drag',
          note,
          { x: 20, y: 65 },
        ),
      ),
    );

    interaction.beginNoteMove(note.id, pointer(40, 50));
    interaction.pointerMove(pointer(55, 60));
    interaction.pointerUp(pointer(55, 60, { buttons: 0 }));

    const layout = store.getState().project.layouts[0]!;
    expect(layout.notes.find((item) => item.id === note.id)).toMatchObject({
      x: 55,
      y: 60,
    });
    expect(layout.lines.find((item) => item.id === 'leader-drag')).toMatchObject({
      x1: 55,
      y1: 60,
      x2: 20,
      y2: 65,
    });
  });

  it('does not allow dragging the Note-attached end of a leader Line', () => {
    const { commands, interaction } = setup();
    const layoutId = 'layout-kitchen';
    const note = createCanvasNote(
      'note-lock',
      { x: 40, y: 50 },
      'Lock end',
    );
    commands.execute(addCanvasNote(layoutId, note));
    commands.execute(
      addNoteLeader(
        layoutId,
        note.id,
        createNoteLeaderLine(
          'leader-lock',
          note,
          { x: 20, y: 65 },
        ),
      ),
    );

    expect(
      interaction.beginLineEndpoint(
        'leader-lock',
        'start',
        pointer(40, 50),
      ),
    ).toBe(false);
    expect(
      interaction.beginLineEndpoint(
        'leader-lock',
        'end',
        pointer(20, 65),
      ),
    ).toBe(true);
  });

  it('cancels a drag without writing preview geometry to the Layout', () => {
    const { store, interaction } = setup();
    const before = structuredClone(store.getState().project.layouts[0]?.dims[0]);

    interaction.beginDimensionEndpoint(
      'dim-1',
      'end',
      pointer(121, 30),
    );
    interaction.pointerMove(pointer(150, 70));
    expect(interaction.getPreview()).not.toBeNull();
    expect(interaction.cancel()).toBe(true);

    expect(store.getState().project.layouts[0]?.dims[0]).toEqual(before);
    expect(store.getState().session.interaction.preview).toBeNull();
  });
});
