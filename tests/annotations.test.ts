import { describe, expect, it } from 'vitest';

import {
  addCanvasNote,
  addDimension,
  addDrawingLine,
  addNoteLeader,
  applicationStateFromLegacyPayload,
  deleteCanvasNote,
  removeNoteLeaders,
  updateCanvasNote,
} from '../src/app';
import {
  annotationSegmentLength,
  createCanvasNote,
  createDimensionAnnotation,
  createDrawingLine,
  createNoteLeaderLine,
  normalizeCanvasNote,
  normalizeDrawingLine,
  noteLeaderLines,
} from '../src/domain/annotations';
import { migrateCadLiteFile } from '../src/persistence';
import {
  v159ProjectFixture,
} from './fixtures/v159-project';

function designState() {
  const payload = structuredClone(v159ProjectFixture);
  if (!payload.ui || typeof payload.ui !== 'object' || Array.isArray(payload.ui)) {
    throw new Error('Fixture UI shape changed');
  }
  payload.ui.workspace = 'layout';
  payload.active = 0;
  return applicationStateFromLegacyPayload(payload);
}

describe('typed annotation migration', () => {
  it('promotes legacy Dimensions and Notes without losing their established geometry', () => {
    const migrated = migrateCadLiteFile(v159ProjectFixture);
    const layout = migrated.project.layouts[0];
    const dimension = layout?.dims[0];
    const note = layout?.notes[0];

    expect(dimension).toMatchObject({
      id: 'dim-1',
      name: 'Overall',
      x1: 25,
      y1: 30,
      x2: 121,
      y2: 30,
      offsetPx: 0,
    });
    expect(annotationSegmentLength(dimension!)).toBe(96);

    expect(note).toMatchObject({
      id: 'note-1',
      text: 'Waterfall end',
      x: 100,
      y: 80,
      fontSize: 12,
      bold: null,
      italic: false,
      align: 'left',
      color: '#111111',
      halo: false,
      rotation: 0,
    });
  });

  it('preserves unknown radius metadata while retaining legacy inferred-bold behavior', () => {
    const note = normalizeCanvasNote({
      id: 'radius-note',
      x: 4,
      y: 5,
      text: 'R 2"',
      annotationType: 'radius',
      radiusRef: {
        kind: 'piece',
        pieceId: 'piece',
        corner: 'tr',
        autoText: true,
      },
    });

    expect(note.bold).toBeNull();
    expect(note.annotationType).toBe('radius');
    expect(note.radiusRef).toEqual({
      kind: 'piece',
      pieceId: 'piece',
      corner: 'tr',
      autoText: true,
    });
  });

  it('normalizes legacy Note leaders as ordinary typed Lines with a relationship', () => {
    const line = normalizeDrawingLine({
      id: 'leader',
      name: 'Note Leader',
      x1: 10,
      y1: 20,
      x2: 2,
      y2: 28,
      style: 'solid',
      color: '#111111',
      thickness: 2,
      startCap: 'none',
      endCap: 'arrow',
      attachedNoteId: 'note',
      attachedEnd: 'start',
      annotationType: 'radius',
    });

    expect(line).toMatchObject({
      attachedNoteId: 'note',
      attachedEnd: 'start',
      endCap: 'arrow',
    });
    expect(line.annotationType).toBe('radius');
  });
});

describe('annotation commands and leader relationships', () => {
  it('adds each annotation type as a normal selected command transaction', () => {
    const initial = designState();
    const layoutId = 'layout-kitchen';

    const dimension = createDimensionAnnotation(
      'dim-new',
      { x: 2, y: 3 },
      { x: 22, y: 3 },
    );
    const afterDimension = addDimension(layoutId, dimension).reduce(initial);
    expect(afterDimension.session.selection).toEqual({
      kind: 'dimension',
      id: 'dim-new',
    });

    const line = createDrawingLine(
      'line-new',
      { x: 8, y: 9 },
      { x: 18, y: 19 },
    );
    const afterLine = addDrawingLine(layoutId, line).reduce(afterDimension);
    expect(afterLine.session.selection).toEqual({
      kind: 'line',
      id: 'line-new',
    });

    const note = createCanvasNote(
      'note-new',
      { x: 30, y: 40 },
      'Verify field seam',
    );
    const afterNote = addCanvasNote(layoutId, note).reduce(afterLine);
    expect(afterNote.session.selection).toEqual({
      kind: 'note',
      id: 'note-new',
    });
    expect(afterNote.project.layouts[0]?.dims).toHaveLength(2);
    expect(afterNote.project.layouts[0]?.lines).toHaveLength(1);
    expect(afterNote.project.layouts[0]?.notes).toHaveLength(2);
  });

  it('keeps a Note leader attached when the Note moves', () => {
    const initial = designState();
    const layoutId = 'layout-kitchen';
    const note = createCanvasNote(
      'note-new',
      { x: 30, y: 40 },
      'Verify field seam',
    );
    const withNote = addCanvasNote(layoutId, note).reduce(initial);
    const leader = createNoteLeaderLine(
      'leader-new',
      note,
      { x: 18, y: 48 },
    );
    const withLeader = addNoteLeader(
      layoutId,
      note.id,
      leader,
    ).reduce(withNote);

    expect(
      noteLeaderLines(
        note.id,
        withLeader.project.layouts[0]?.lines ?? [],
      ),
    ).toHaveLength(1);

    const moved = updateCanvasNote(
      layoutId,
      note.id,
      { x: 55.125, y: 62.5 },
    ).reduce(withLeader);
    const nextLeader = moved.project.layouts[0]?.lines.find(
      (item) => item.id === leader.id,
    );

    expect(nextLeader).toMatchObject({
      x1: 55.125,
      y1: 62.5,
      x2: 18,
      y2: 48,
      attachedNoteId: note.id,
      attachedEnd: 'start',
    });
  });

  it('deleting a Note removes every attached leader atomically', () => {
    const initial = designState();
    const layoutId = 'layout-kitchen';
    const note = createCanvasNote(
      'note-new',
      { x: 30, y: 40 },
      'Verify field seam',
    );
    const withNote = addCanvasNote(layoutId, note).reduce(initial);
    const leader = createNoteLeaderLine(
      'leader-new',
      note,
      { x: 18, y: 48 },
    );
    const withLeader = addNoteLeader(
      layoutId,
      note.id,
      leader,
    ).reduce(withNote);

    const deleted = deleteCanvasNote(
      layoutId,
      note.id,
    ).reduce(withLeader);

    expect(
      deleted.project.layouts[0]?.notes.some(
        (item) => item.id === note.id,
      ),
    ).toBe(false);
    expect(
      deleted.project.layouts[0]?.lines.some(
        (item) => item.attachedNoteId === note.id,
      ),
    ).toBe(false);
    expect(deleted.session.selection).toEqual({ kind: 'none' });
  });

  it('can remove Note leaders without deleting the Note', () => {
    const initial = designState();
    const layoutId = 'layout-kitchen';
    const note = createCanvasNote(
      'note-new',
      { x: 30, y: 40 },
      'Verify field seam',
    );
    const withNote = addCanvasNote(layoutId, note).reduce(initial);
    const leader = createNoteLeaderLine(
      'leader-new',
      note,
      { x: 18, y: 48 },
    );
    const withLeader = addNoteLeader(
      layoutId,
      note.id,
      leader,
    ).reduce(withNote);
    const removed = removeNoteLeaders(
      layoutId,
      note.id,
    ).reduce(withLeader);

    expect(
      removed.project.layouts[0]?.notes.some(
        (item) => item.id === note.id,
      ),
    ).toBe(true);
    expect(
      removed.project.layouts[0]?.lines.some(
        (item) => item.id === leader.id,
      ),
    ).toBe(false);
    expect(removed.session.selection).toEqual({
      kind: 'note',
      id: note.id,
    });
  });

  it('keeps annotation mutations inert outside DESIGN', () => {
    const slabState = applicationStateFromLegacyPayload(v159ProjectFixture);
    const dimension = createDimensionAnnotation(
      'dim-new',
      { x: 2, y: 3 },
      { x: 22, y: 3 },
    );

    expect(
      addDimension('layout-bath', dimension).reduce(slabState),
    ).toBe(slabState);
  });
});
