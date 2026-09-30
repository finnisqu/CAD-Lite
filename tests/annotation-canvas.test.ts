import { describe, expect, it } from 'vitest';

import {
  applicationStateFromLegacyPayload,
  setSelection,
} from '../src/app';
import {
  createAnnotationCanvasProjection,
  hitTestAnnotations,
} from '../src/browser/annotation-canvas-model';
import { v159ProjectFixture } from './fixtures/v159-project';

function state() {
  const payload = structuredClone(v159ProjectFixture);
  if (!payload.ui || typeof payload.ui !== 'object' || Array.isArray(payload.ui)) {
    throw new Error('Fixture UI shape changed');
  }
  payload.ui.workspace = 'layout';
  payload.active = 0;
  return applicationStateFromLegacyPayload(payload);
}

describe('Batch 20 annotation canvas projection', () => {
  it('projects typed annotations only in DESIGN and converts dimension offset pixels through scale', () => {
    const design = state();
    const layout = design.project.layouts[0]!;
    layout.scale = 4;
    layout.dims[0]!.offsetPx = 8;

    const projected = createAnnotationCanvasProjection(design);
    expect(projected.dimensions).toHaveLength(1);
    expect(projected.notes).toHaveLength(1);
    expect(projected.dimensions[0]?.length).toBe(96);
    expect(projected.dimensions[0]?.displayY1).toBe(32);
    expect(projected.dimensions[0]?.displayY2).toBe(32);

    const slab = {
      ...design,
      session: { ...design.session, workspace: 'slab' as const },
    };
    expect(createAnnotationCanvasProjection(slab)).toEqual({
      dimensions: [],
      lines: [],
      notes: [],
    });
  });

  it('uses the shared application Selection for annotation selection', () => {
    const initial = state();
    const selected = setSelection({ kind: 'dimension', id: 'dim-1' }).reduce(initial);
    const projected = createAnnotationCanvasProjection(selected);
    expect(projected.dimensions[0]?.selected).toBe(true);
    expect(projected.notes[0]?.selected).toBe(false);
  });

  it('hit-tests notes before lines and dimensions using screen-sized tolerances', () => {
    const initial = state();
    const layout = initial.project.layouts[0]!;
    layout.scale = 6;
    layout.lines.push({
      id: 'line-hit',
      name: 'Leader test',
      x1: 10,
      y1: 10,
      x2: 40,
      y2: 10,
      style: 'solid',
      color: '#111111',
      thickness: 2,
      startCap: 'none',
      endCap: 'none',
      attachedNoteId: null,
      attachedEnd: null,
    });
    layout.notes.push({
      id: 'note-hit',
      x: 20,
      y: 10,
      text: 'Note',
      fontSize: 12,
      bold: false,
      italic: false,
      align: 'left',
      color: '#111111',
      halo: false,
      rotation: 0,
    });

    const projected = createAnnotationCanvasProjection(initial);
    expect(hitTestAnnotations(projected, { x: 20, y: 10 }, 6)).toEqual({
      kind: 'note',
      id: 'note-hit',
    });
    expect(hitTestAnnotations(projected, { x: 35, y: 10.5 }, 6)).toEqual({
      kind: 'line',
      id: 'line-hit',
    });
  });
});
