import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  ToolController,
  addRadiusAnnotation,
  applicationStateFromLegacyPayload,
  setActiveLayout,
  setWorkspace,
  transformPieces,
  updatePreferences,
} from '../src/app';
import { createAnnotationCanvasProjection } from '../src/browser/annotation-canvas-model';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  const commands = new CommandDispatcher(store);
  commands.execute(setActiveLayout('layout-kitchen'));
  commands.execute(setWorkspace('design'));
  const piece = store.getState().project.layouts
    .find((layout) => layout.id === 'layout-kitchen')
    ?.pieces.find((item) => item.id === 'piece-1');
  if (!piece) throw new Error('Missing Piece fixture');
  commands.execute(
    transformPieces('layout-kitchen', [
      {
        id: piece.id,
        geometry: {
          kind: 'rectangle',
          width: piece.w,
          height: piece.h,
          cornerRadii: { ...piece.cornerRadii, tl: 2 },
        },
      },
    ]),
  );
  commands.execute(
    addRadiusAnnotation(
      'layout-kitchen',
      { kind: 'piece', pieceId: 'piece-1', corner: 'tl' },
      { noteId: 'radius-note', lineId: 'radius-line' },
    ),
  );
  return { store, commands, tools: new ToolController(store, commands) };
}

describe('radius annotation visibility projection', () => {
  it('uses showRadiusLabels independently from generic Notes and Lines', () => {
    const { store, commands } = setup();
    commands.execute(
      updatePreferences({
        showNotes: false,
        showLines: false,
        showRadiusLabels: true,
      }),
    );

    const visible = createAnnotationCanvasProjection(store.getState());
    expect(visible.notes.map((note) => note.id)).toEqual(['radius-note']);
    expect(visible.lines.map((line) => line.id)).toEqual(['radius-line']);

    commands.execute(updatePreferences({ showRadiusLabels: false }));
    const hidden = createAnnotationCanvasProjection(store.getState());
    expect(hidden.notes).toEqual([]);
    expect(hidden.lines).toEqual([]);
  });

  it('temporarily forces Radius labels visible while the Radius tool is active', () => {
    const { store, commands, tools } = setup();
    commands.execute(
      updatePreferences({
        showNotes: false,
        showLines: false,
        showRadiusLabels: false,
      }),
    );
    expect(createAnnotationCanvasProjection(store.getState()).notes).toEqual([]);

    tools.activateLocked('radius');
    const active = createAnnotationCanvasProjection(store.getState());
    expect(active.notes.map((note) => note.id)).toEqual(['radius-note']);
    expect(active.lines.map((line) => line.id)).toEqual(['radius-line']);

    tools.cancel();
    expect(createAnnotationCanvasProjection(store.getState()).notes).toEqual([]);
  });
});
