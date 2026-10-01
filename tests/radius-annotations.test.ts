import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  addPieceSink,
  addRadiusAnnotation,
  applicationStateFromLegacyPayload,
  deletePieces,
  editPieceSink,
  removePieceSink,
  removeRadiusAnnotation,
  setActiveLayout,
  setWorkspace,
  transformPieces,
  updateCanvasNote,
  updatePreferences,
} from '../src/app';
import {
  pieceRadiusTarget,
  radiusLabelPosition,
} from '../src/domain/annotations/radius';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(v159ProjectFixture),
  );
  const commands = new CommandDispatcher(store);
  commands.execute(setActiveLayout('layout-kitchen'));
  commands.execute(setWorkspace('design'));
  return { store, commands };
}

function layout(store: AppStore) {
  return store.getState().project.layouts.find(
    (item) => item.id === 'layout-kitchen',
  );
}

function setTopLeftRadius(
  store: AppStore,
  commands: CommandDispatcher,
  radius: number,
) {
  const piece = layout(store)?.pieces.find((item) => item.id === 'piece-1');
  if (!piece) throw new Error('Missing Piece fixture');
  commands.execute(
    transformPieces('layout-kitchen', [
      {
        id: piece.id,
        geometry: {
          kind: 'rectangle',
          width: piece.w,
          height: piece.h,
          cornerRadii: { ...piece.cornerRadii, tl: radius },
        },
      },
    ]),
  );
}

function addPieceRadius(
  store: AppStore,
  commands: CommandDispatcher,
  radius = 2,
) {
  setTopLeftRadius(store, commands, radius);
  commands.execute(
    addRadiusAnnotation(
      'layout-kitchen',
      { kind: 'piece', pieceId: 'piece-1', corner: 'tl' },
      { noteId: 'radius-note', lineId: 'radius-line' },
    ),
  );
}

describe('radius annotation geometry and commands', () => {
  it('projects the production 45-degree arc target and outside label position', () => {
    const { store, commands } = setup();
    setTopLeftRadius(store, commands, 2);
    const current = layout(store);
    const piece = current?.pieces.find((item) => item.id === 'piece-1');
    if (!current || !piece) throw new Error('Missing fixture geometry');

    const target = pieceRadiusTarget(piece, 'tl');
    expect(target).toBeTruthy();
    if (!target) return;
    expect(target.x).toBeCloseTo(25.586, 3);
    expect(target.y).toBeCloseTo(30.586, 3);
    expect(target.outward.x).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(target.outward.y).toBeCloseTo(-Math.SQRT1_2, 6);

    const label = radiusLabelPosition(current, target, 'outside');
    expect(label.x).toBeCloseTo(18.515, 3);
    expect(label.y).toBeCloseTo(23.515, 3);
  });

  it('adds one production-compatible Note + attached leader per radius target', () => {
    const { store, commands } = setup();
    addPieceRadius(store, commands);

    const current = layout(store);
    const note = current?.notes.find((item) => item.id === 'radius-note');
    const line = current?.lines.find((item) => item.id === 'radius-line');
    expect(note).toMatchObject({
      text: 'R2"',
      annotationType: 'radius',
      radiusRef: {
        kind: 'piece',
        pieceId: 'piece-1',
        corner: 'tl',
        autoText: true,
      },
    });
    expect(line).toMatchObject({
      name: 'Radius Leader',
      attachedNoteId: 'radius-note',
      attachedEnd: 'start',
      endCap: 'arrow',
      annotationType: 'radius',
    });

    commands.execute(
      addRadiusAnnotation(
        'layout-kitchen',
        { kind: 'piece', pieceId: 'piece-1', corner: 'tl' },
        { noteId: 'duplicate-note', lineId: 'duplicate-line' },
      ),
    );
    expect(layout(store)?.notes.filter((item) => item.annotationType === 'radius')).toHaveLength(1);
  });

  it('keeps the Note and target endpoint synchronized in the same Piece transform commit', () => {
    const { store, commands } = setup();
    addPieceRadius(store, commands);
    const before = layout(store);
    const piece = before?.pieces.find((item) => item.id === 'piece-1');
    const note = before?.notes.find((item) => item.id === 'radius-note');
    const line = before?.lines.find((item) => item.id === 'radius-line');
    if (!piece || !note || !line) throw new Error('Missing radius fixture');

    commands.execute(
      transformPieces('layout-kitchen', [
        {
          id: piece.id,
          designPose: {
            x: piece.x + 10,
            y: piece.y + 5,
            rotation: piece.rotation,
          },
        },
      ]),
    );

    const after = layout(store);
    const movedNote = after?.notes.find((item) => item.id === 'radius-note');
    const movedLine = after?.lines.find((item) => item.id === 'radius-line');
    expect(movedNote?.x).toBeCloseTo(note.x + 10, 3);
    expect(movedNote?.y).toBeCloseTo(note.y + 5, 3);
    expect(movedLine?.x1).toBeCloseTo((line.x1 as number) + 10, 3);
    expect(movedLine?.y1).toBeCloseTo((line.y1 as number) + 5, 3);
    expect(movedLine?.x2).toBeCloseTo((line.x2 as number) + 10, 3);
    expect(movedLine?.y2).toBeCloseTo((line.y2 as number) + 5, 3);
  });

  it('updates automatic text with radius and number-format changes', () => {
    const { store, commands } = setup();
    addPieceRadius(store, commands, 2.125);
    expect(layout(store)?.notes.find((item) => item.id === 'radius-note')?.text).toBe('R2 1/8"');

    commands.execute(updatePreferences({ dimFormat: 'decimal' }));
    expect(layout(store)?.notes.find((item) => item.id === 'radius-note')?.text).toBe('R2.125"');

    setTopLeftRadius(store, commands, 3);
    expect(layout(store)?.notes.find((item) => item.id === 'radius-note')?.text).toBe('R3"');
  });

  it('preserves manual radius text while continuing to follow geometry', () => {
    const { store, commands } = setup();
    addPieceRadius(store, commands);
    const before = layout(store)?.notes.find((item) => item.id === 'radius-note');
    if (!before) throw new Error('Missing radius Note');

    commands.execute(
      updateCanvasNote('layout-kitchen', 'radius-note', { text: 'FIELD VERIFY' }),
    );
    setTopLeftRadius(store, commands, 3);

    const after = layout(store)?.notes.find((item) => item.id === 'radius-note');
    expect(after?.text).toBe('FIELD VERIFY');
    expect(after?.radiusRef).toMatchObject({ autoText: false });
    expect(after?.x).not.toBe(before.x);
    expect(after?.y).not.toBe(before.y);
  });

  it('creates and synchronizes Sink-corner radius annotations', () => {
    const { store, commands } = setup();
    commands.execute(addPieceSink('layout-kitchen', 'piece-1', 'sink-radius'));
    commands.execute(
      addRadiusAnnotation(
        'layout-kitchen',
        {
          kind: 'sink',
          pieceId: 'piece-1',
          sinkId: 'sink-radius',
          corner: 'tl',
        },
        { noteId: 'sink-radius-note', lineId: 'sink-radius-line' },
      ),
    );
    const before = layout(store)?.notes.find((item) => item.id === 'sink-radius-note');
    expect(before?.text).toBe('R4"');

    commands.execute(
      editPieceSink('layout-kitchen', 'piece-1', 'sink-radius', {
        centerline: 35,
        cornerR: 2,
      }),
    );
    const after = layout(store)?.notes.find((item) => item.id === 'sink-radius-note');
    expect(after?.text).toBe('R2"');
    expect(after?.x).not.toBe(before?.x);

    commands.execute(removePieceSink('layout-kitchen', 'piece-1', 'sink-radius'));
    expect(layout(store)?.notes.some((item) => item.id === 'sink-radius-note')).toBe(false);
    expect(layout(store)?.lines.some((item) => item.id === 'sink-radius-line')).toBe(false);
  });

  it('removes Radius Note + leader atomically through erase and source deletion', () => {
    const erased = setup();
    addPieceRadius(erased.store, erased.commands);
    erased.commands.execute(
      removeRadiusAnnotation('layout-kitchen', {
        kind: 'piece',
        pieceId: 'piece-1',
        corner: 'tl',
      }),
    );
    expect(layout(erased.store)?.notes.some((item) => item.id === 'radius-note')).toBe(false);
    expect(layout(erased.store)?.lines.some((item) => item.id === 'radius-line')).toBe(false);

    const deleted = setup();
    addPieceRadius(deleted.store, deleted.commands);
    deleted.commands.execute(deletePieces('layout-kitchen', ['piece-1']));
    expect(layout(deleted.store)?.notes.some((item) => item.id === 'radius-note')).toBe(false);
    expect(layout(deleted.store)?.lines.some((item) => item.id === 'radius-line')).toBe(false);
  });

  it('does not create Sink radius labels for oval sinks', () => {
    const { store, commands } = setup();
    commands.execute(addPieceSink('layout-kitchen', 'piece-1', 'sink-oval'));
    commands.execute(
      editPieceSink('layout-kitchen', 'piece-1', 'sink-oval', {
        shape: 'oval',
      }),
    );
    commands.execute(
      addRadiusAnnotation(
        'layout-kitchen',
        {
          kind: 'sink',
          pieceId: 'piece-1',
          sinkId: 'sink-oval',
          corner: 'tl',
        },
        { noteId: 'oval-note', lineId: 'oval-line' },
      ),
    );
    expect(layout(store)?.notes.some((item) => item.id === 'oval-note')).toBe(false);
  });
});
