import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CanvasSelectionActions,
  CommandDispatcher,
  addNoteLeader,
  applicationStateFromLegacyPayload,
  setActiveLayout,
  setSelection,
  setWorkspace,
} from '../src/app';
import { createNoteLeaderLine } from '../src/domain/annotations';
import { v159ProjectFixture } from './fixtures/v159-project';

function setup() {
  const store = new AppStore(
    applicationStateFromLegacyPayload(structuredClone(v159ProjectFixture)),
  );
  const commands = new CommandDispatcher(store);
  let nextId = 0;
  const actions = new CanvasSelectionActions(
    store,
    commands,
    (prefix) => `${prefix}-copy-${++nextId}`,
  );
  commands.execute(setActiveLayout('layout-kitchen'));
  commands.execute(setWorkspace('design'));
  return { store, commands, actions };
}

describe('Batch 31 canvas selection / clipboard parity', () => {
  it('duplicates a Dimension one grid step and selects the copy', () => {
    const { store, commands, actions } = setup();
    commands.execute(setSelection({ kind: 'dimension', id: 'dim-1' }));

    expect(actions.duplicate()).toBe(true);

    const layout = store.getState().project.layouts[0]!;
    expect(layout.dims).toHaveLength(2);
    expect(layout.dims[1]).toMatchObject({
      id: 'dimension-copy-1',
      name: 'Overall Copy',
      x1: 26,
      y1: 31,
      x2: 122,
      y2: 31,
    });
    expect(store.getState().session.selection).toEqual({
      kind: 'dimension',
      id: 'dimension-copy-1',
    });
  });

  it('duplicates a Note with its attached leader topology', () => {
    const { store, commands, actions } = setup();
    const layout = store.getState().project.layouts[0]!;
    const note = layout.notes.find((item) => item.id === 'note-1')!;
    commands.execute(
      addNoteLeader(
        layout.id,
        note.id,
        createNoteLeaderLine('leader-1', note, { x: 82, y: 91 }),
      ),
    );
    commands.execute(setSelection({ kind: 'note', id: note.id }));

    expect(actions.duplicate()).toBe(true);

    const next = store.getState().project.layouts[0]!;
    const copiedNote = next.notes.find((item) => item.id === 'note-copy-1')!;
    const copiedLeader = next.lines.find(
      (line) => line.attachedNoteId === copiedNote.id,
    )!;
    expect(copiedNote).toMatchObject({ x: 101, y: 81, text: 'Waterfall end' });
    expect(copiedLeader).toBeDefined();
    expect(copiedLeader.id).not.toBe('leader-1');
    expect(store.getState().session.selection).toEqual({
      kind: 'note',
      id: copiedNote.id,
    });
  });

  it('duplicates a copied Note repeatedly with increasing paste offsets', () => {
    const { store, commands, actions } = setup();
    commands.execute(setSelection({ kind: 'note', id: 'note-1' }));
    expect(actions.copy()).toBe(true);

    expect(actions.paste()).toBe(true);
    expect(actions.paste()).toBe(true);

    const notes = store.getState().project.layouts[0]!.notes;
    expect(notes.at(-2)).toMatchObject({ x: 101, y: 81 });
    expect(notes.at(-1)).toMatchObject({ x: 102, y: 82 });
  });

  it('detaches a copied Line from its Note before duplication', () => {
    const { store, commands, actions } = setup();
    const layout = store.getState().project.layouts[0]!;
    const note = layout.notes[0]!;
    commands.execute(
      addNoteLeader(
        layout.id,
        note.id,
        createNoteLeaderLine('leader-copy-source', note, { x: 75, y: 95 }),
      ),
    );
    commands.execute(
      setSelection({ kind: 'line', id: 'leader-copy-source' }),
    );

    expect(actions.duplicate()).toBe(true);

    const copy = store.getState().project.layouts[0]!.lines.at(-1)!;
    expect(copy.name.endsWith('Copy')).toBe(true);
    expect(copy.attachedNoteId).toBeNull();
    expect(copy.attachedEnd).toBeNull();
  });

  it('copies Pieces across Layouts and re-homes them to the target Area', () => {
    const { store, commands, actions } = setup();
    commands.execute(setSelection({ kind: 'pieces', ids: ['piece-1'] }));
    expect(actions.copy()).toBe(true);
    expect(actions.getClipboardKind()).toBe('pieces');

    commands.execute(setActiveLayout('layout-bath'));
    expect(actions.paste()).toBe(true);

    const target = store.getState().project.layouts[1]!;
    expect(target.pieces).toHaveLength(1);
    expect(target.pieces[0]).toMatchObject({
      name: 'Island Copy',
      areaId: 'area-bath',
      x: 26,
      y: 31,
      slabPlacement: { x: 26, y: 31, rotation: 0 },
    });
    expect(target.pieces[0]!.id).not.toBe('piece-1');
    expect(store.getState().session.selection).toEqual({
      kind: 'pieces',
      ids: [target.pieces[0]!.id],
    });
  });

  it('duplicates a SLAB overlay once and enforces the production two-overlay limit', () => {
    const { store, commands, actions } = setup();
    commands.execute(setWorkspace('slab'));
    commands.execute(setSelection({ kind: 'slab', id: 'slab-1' }));

    expect(actions.duplicate()).toBe(true);
    expect(store.getState().project.layouts[0]!.overlays).toHaveLength(2);
    expect(actions.duplicate()).toBe(false);
    expect(store.getState().project.layouts[0]!.overlays).toHaveLength(2);
  });

  it('selects all Pieces in the active Layout', () => {
    const { store, actions } = setup();

    expect(actions.selectAllPieces()).toBe(true);
    expect(store.getState().session.selection).toEqual({
      kind: 'pieces',
      ids: ['piece-1'],
    });
  });
});
