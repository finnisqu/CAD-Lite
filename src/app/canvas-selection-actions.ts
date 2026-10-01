import {
  addCanvasNote,
  addDimension,
  addDrawingLine,
  addNoteLeader,
  addSlabSurface,
  duplicatePieces,
  setSelection,
} from './commands';
import type { CommandDispatcher } from './commands';
import type { AppStore } from './store';
import {
  createPieceClipboardPayload,
  preparePieceClipboardPaste,
  preparePieceDuplication,
  pieceWorkspaceCanvasSize,
  type PieceClipboardPayload,
} from '../domain/pieces';
import type {
  CanvasNote,
  DimensionAnnotation,
  DrawingLine,
} from '../domain/annotations';
import type { Layout } from '../domain/project';
import type { SlabSurface } from '../domain/slabs';
import { cloneJson } from '../domain/types';
import { round3 } from '../core/numeric';

export type CanvasEntityIdFactory = (prefix: string) => string;

type DimensionClipboard = {
  kind: 'dimension';
  entity: DimensionAnnotation;
  pasteCount: number;
};
type LineClipboard = {
  kind: 'line';
  entity: DrawingLine;
  pasteCount: number;
};
type NoteClipboard = {
  kind: 'note';
  entity: CanvasNote;
  leaders: DrawingLine[];
  pasteCount: number;
};
type PiecesClipboard = {
  kind: 'pieces';
  payload: PieceClipboardPayload;
  pasteCount: number;
};

type CanvasClipboard =
  | DimensionClipboard
  | LineClipboard
  | NoteClipboard
  | PiecesClipboard;

function activeLayout(store: AppStore): Layout | null {
  const state = store.getState();
  return (
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null
  );
}

function clipboardOffset(
  min: number,
  max: number,
  limit: number,
  desired: number,
): number {
  const size = Math.max(0, max - min);
  if (size > Math.max(0, limit)) return -min;
  return Math.max(-min, Math.min(limit - max, desired));
}

function duplicateOffset(
  min: number,
  max: number,
  limit: number,
  step: number,
): number {
  const next = max + step > limit ? -step : step;
  return min + next < 0 || max + next > limit ? 0 : next;
}

function shiftedSegment<T extends DimensionAnnotation | DrawingLine>(
  source: T,
  layout: Layout,
  desired: number,
  paste: boolean,
): T {
  const minX = Math.min(source.x1, source.x2);
  const maxX = Math.max(source.x1, source.x2);
  const minY = Math.min(source.y1, source.y2);
  const maxY = Math.max(source.y1, source.y2);
  const dx = paste
    ? clipboardOffset(minX, maxX, layout.cw, desired)
    : duplicateOffset(minX, maxX, layout.cw, desired);
  const dy = paste
    ? clipboardOffset(minY, maxY, layout.ch, desired)
    : duplicateOffset(minY, maxY, layout.ch, desired);
  return {
    ...cloneJson(source),
    x1: round3(source.x1 + dx),
    y1: round3(source.y1 + dy),
    x2: round3(source.x2 + dx),
    y2: round3(source.y2 + dy),
  };
}

function shiftedNote(
  source: CanvasNote,
  layout: Layout,
  desired: number,
  paste: boolean,
): { note: CanvasNote; dx: number; dy: number } {
  const dx = paste
    ? clipboardOffset(source.x, source.x, layout.cw, desired)
    : duplicateOffset(source.x, source.x, layout.cw, desired);
  const dy = paste
    ? clipboardOffset(source.y, source.y, layout.ch, desired)
    : duplicateOffset(source.y, source.y, layout.ch, desired);
  return {
    note: {
      ...cloneJson(source),
      x: round3(source.x + dx),
      y: round3(source.y + dy),
    },
    dx,
    dy,
  };
}

export class CanvasSelectionActions {
  private clipboard: CanvasClipboard | null = null;

  constructor(
    private readonly store: AppStore,
    private readonly commands: CommandDispatcher,
    private readonly createId: CanvasEntityIdFactory,
  ) {}

  getClipboardKind(): CanvasClipboard['kind'] | null {
    return this.clipboard?.kind ?? null;
  }

  copy(): boolean {
    const state = this.store.getState();
    const layout = activeLayout(this.store);
    const selection = state.session.selection;
    if (!layout) return false;

    if (selection.kind === 'dimension') {
      const source = layout.dims.find((item) => item.id === selection.id);
      if (!source) return false;
      this.clipboard = {
        kind: 'dimension',
        entity: cloneJson(source),
        pasteCount: 0,
      };
      return true;
    }

    if (selection.kind === 'line') {
      const source = layout.lines.find((item) => item.id === selection.id);
      if (!source) return false;
      this.clipboard = {
        kind: 'line',
        entity: {
          ...cloneJson(source),
          attachedNoteId: null,
          attachedEnd: null,
        },
        pasteCount: 0,
      };
      return true;
    }

    if (selection.kind === 'note') {
      const source = layout.notes.find((item) => item.id === selection.id);
      if (!source) return false;
      this.clipboard = {
        kind: 'note',
        entity: cloneJson(source),
        leaders: layout.lines
          .filter((line) => line.attachedNoteId === source.id)
          .map((line) => cloneJson(line)),
        pasteCount: 0,
      };
      return true;
    }

    if (selection.kind === 'pieces' && selection.ids.length) {
      const payload = createPieceClipboardPayload(layout, selection.ids);
      if (!payload) return false;
      this.clipboard = { kind: 'pieces', payload, pasteCount: 0 };
      return true;
    }

    return false;
  }

  paste(): boolean {
    const clip = this.clipboard;
    const state = this.store.getState();
    const layout = activeLayout(this.store);
    if (!clip || !layout) return false;
    const count = Math.max(1, clip.pasteCount + 1);

    if (clip.kind === 'pieces') {
      const plan = preparePieceClipboardPaste(
        layout,
        clip.payload,
        count,
        this.createId,
      );
      const changed = this.commands.execute(duplicatePieces(layout.id, plan));
      if (!changed) return false;
      clip.pasteCount = count;
      return true;
    }

    if (state.session.workspace !== 'design') return false;
    const desired = Math.max(0.001, Math.abs(layout.grid || 1)) * count;

    if (clip.kind === 'dimension') {
      const copy = shiftedSegment(clip.entity, layout, desired, true);
      copy.id = this.createId('dimension');
      copy.name = `${clip.entity.name || 'Dimension'} Copy`;
      const changed = this.commands.execute(addDimension(layout.id, copy));
      if (!changed) return false;
      clip.pasteCount = count;
      return true;
    }

    if (clip.kind === 'line') {
      const copy = shiftedSegment(clip.entity, layout, desired, true);
      copy.id = this.createId('line');
      copy.name = `${clip.entity.name || 'Line'} Copy`;
      copy.attachedNoteId = null;
      copy.attachedEnd = null;
      const changed = this.commands.execute(addDrawingLine(layout.id, copy));
      if (!changed) return false;
      clip.pasteCount = count;
      return true;
    }

    const shifted = shiftedNote(clip.entity, layout, desired, true);
    const note = shifted.note;
    note.id = this.createId('note');
    const leaders = clip.leaders.map((source) => ({
      ...cloneJson(source),
      id: this.createId('line'),
      attachedNoteId: note.id,
      x1: round3(source.x1 + shifted.dx),
      y1: round3(source.y1 + shifted.dy),
      x2: round3(source.x2 + shifted.dx),
      y2: round3(source.y2 + shifted.dy),
    }));
    const changed = this.commands.executeTransaction(
      'Paste note',
      [
        addCanvasNote(layout.id, note),
        ...leaders.map((leader) => addNoteLeader(layout.id, note.id, leader)),
      ],
    );
    if (!changed) return false;
    clip.pasteCount = count;
    return true;
  }

  duplicate(): boolean {
    const state = this.store.getState();
    const layout = activeLayout(this.store);
    const selection = state.session.selection;
    if (!layout) return false;

    if (selection.kind === 'pieces' && selection.ids.length) {
      const plan = preparePieceDuplication(
        layout,
        selection.ids,
        'design',
        this.createId,
      );
      return this.commands.execute(duplicatePieces(layout.id, plan)) !== null;
    }

    if (selection.kind === 'slab' && state.session.workspace === 'slab') {
      if (layout.overlays.length >= 2) return false;
      const source = layout.overlays.find((item) => item.id === selection.id);
      if (!source) return false;
      const step = Math.max(0.001, Math.abs(layout.grid || 1));
      const canvas = pieceWorkspaceCanvasSize(layout, 'slab');
      const copy: SlabSurface = {
        ...cloneJson(source),
        id: this.createId('slab'),
        name: `${source.name || 'Overlay'} Copy`,
        x: round3(
          Math.max(0, Math.min(source.x + step, canvas.w - source.slabW)),
        ),
        y: round3(
          Math.max(0, Math.min(source.y + step, canvas.h - source.slabH)),
        ),
      };
      return this.commands.execute(addSlabSurface(layout.id, copy)) !== null;
    }

    if (state.session.workspace !== 'design') return false;
    const step = Math.max(0.001, Math.abs(layout.grid || 1));

    if (selection.kind === 'dimension') {
      const source = layout.dims.find((item) => item.id === selection.id);
      if (!source) return false;
      const copy = shiftedSegment(source, layout, step, false);
      copy.id = this.createId('dimension');
      copy.name = `${source.name || 'Dimension'} Copy`;
      return this.commands.execute(addDimension(layout.id, copy)) !== null;
    }

    if (selection.kind === 'line') {
      const source = layout.lines.find((item) => item.id === selection.id);
      if (!source) return false;
      const copy = shiftedSegment(source, layout, step, false);
      copy.id = this.createId('line');
      copy.name = `${source.name || 'Line'} Copy`;
      copy.attachedNoteId = null;
      copy.attachedEnd = null;
      return this.commands.execute(addDrawingLine(layout.id, copy)) !== null;
    }

    if (selection.kind === 'note') {
      const source = layout.notes.find((item) => item.id === selection.id);
      if (!source) return false;
      const shifted = shiftedNote(source, layout, step, false);
      const note = shifted.note;
      note.id = this.createId('note');
      const leaders = layout.lines
        .filter((line) => line.attachedNoteId === source.id)
        .map((line) => ({
          ...cloneJson(line),
          id: this.createId('line'),
          attachedNoteId: note.id,
          x1: round3(line.x1 + shifted.dx),
          y1: round3(line.y1 + shifted.dy),
          x2: round3(line.x2 + shifted.dx),
          y2: round3(line.y2 + shifted.dy),
        }));
      return (
        this.commands.executeTransaction(
          'Duplicate note',
          [
            addCanvasNote(layout.id, note),
            ...leaders.map((leader) =>
              addNoteLeader(layout.id, note.id, leader),
            ),
          ],
        ) !== null
      );
    }

    return false;
  }

  selectAllPieces(): boolean {
    const layout = activeLayout(this.store);
    if (!layout) return false;
    const ids = layout.pieces.map((piece) => piece.id);
    return (
      this.commands.execute(
        setSelection(ids.length ? { kind: 'pieces', ids } : { kind: 'none' }),
      ) !== null
    );
  }
}
