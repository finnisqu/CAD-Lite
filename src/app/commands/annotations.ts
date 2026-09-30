import type { Layout } from '../../domain/project';
import {
  normalizeCanvasNote,
  normalizeDimensionAnnotation,
  normalizeDrawingLine,
  syncNoteLeaderLines,
  type CanvasNote,
  type CanvasNotePatch,
  type DimensionAnnotation,
  type DimensionPatch,
  type DrawingLine,
  type DrawingLinePatch,
} from '../../domain/annotations';
import type {
  ReadonlyApplicationState,
  Selection,
} from '../state';
import type { AppCommand } from './types';

function designLayout(
  state: ReadonlyApplicationState,
  layoutId: string,
): { layout: Layout; index: number } | null {
  if (
    state.session.workspace !== 'design' ||
    state.session.activeLayoutId !== layoutId
  ) {
    return null;
  }
  const index = state.project.layouts.findIndex(
    (layout) => layout.id === layoutId,
  );
  const layout = state.project.layouts[index];
  return index >= 0 && layout ? { layout, index } : null;
}

function replace(
  state: ReadonlyApplicationState,
  index: number,
  layout: Layout,
  selection: Selection = state.session.selection,
) {
  const layouts = [...state.project.layouts];
  layouts[index] = layout;
  return {
    ...state,
    project: { ...state.project, layouts },
    session: { ...state.session, selection },
  };
}

function selected(
  kind: 'dimension' | 'line' | 'note',
  id: string,
): Selection {
  return { kind, id };
}

function clearIfSelected(
  state: ReadonlyApplicationState,
  kind: 'dimension' | 'line' | 'note',
  id: string,
): Selection {
  return state.session.selection.kind === kind &&
    state.session.selection.id === id
    ? { kind: 'none' }
    : state.session.selection;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function addDimension(
  layoutId: string,
  dimension: DimensionAnnotation,
): AppCommand {
  return {
    type: 'annotation.dimension.add',
    label: 'Add dimension',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (
        !target ||
        target.layout.dims.some((item) => item.id === dimension.id)
      ) {
        return state;
      }
      const next = normalizeDimensionAnnotation(
        dimension,
        target.layout.dims.length,
        `${layoutId}-dimension`,
      );
      return replace(
        state,
        target.index,
        { ...target.layout, dims: [...target.layout.dims, next] },
        selected('dimension', next.id),
      );
    },
  };
}

export function updateDimension(
  layoutId: string,
  id: string,
  patch: DimensionPatch,
): AppCommand {
  return {
    type: 'annotation.dimension.update',
    label: 'Update dimension',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (!target) return state;
      const index = target.layout.dims.findIndex((item) => item.id === id);
      const current = target.layout.dims[index];
      if (index < 0 || !current) return state;
      const next = normalizeDimensionAnnotation(
        { ...current, ...patch, id: current.id },
        index,
        `${layoutId}-dimension`,
      );
      if (sameJson(current, next)) return state;
      const dims = [...target.layout.dims];
      dims[index] = next;
      return replace(state, target.index, { ...target.layout, dims });
    },
  };
}

export function deleteDimension(
  layoutId: string,
  id: string,
): AppCommand {
  return {
    type: 'annotation.dimension.delete',
    label: 'Delete dimension',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (!target || !target.layout.dims.some((item) => item.id === id)) {
        return state;
      }
      return replace(
        state,
        target.index,
        {
          ...target.layout,
          dims: target.layout.dims.filter((item) => item.id !== id),
        },
        clearIfSelected(state, 'dimension', id),
      );
    },
  };
}

export function addDrawingLine(
  layoutId: string,
  line: DrawingLine,
): AppCommand {
  return {
    type: 'annotation.line.add',
    label: 'Add line',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (
        !target ||
        target.layout.lines.some((item) => item.id === line.id)
      ) {
        return state;
      }
      const next = normalizeDrawingLine(
        line,
        target.layout.lines.length,
        `${layoutId}-line`,
      );
      if (
        next.attachedNoteId &&
        !target.layout.notes.some((note) => note.id === next.attachedNoteId)
      ) {
        return state;
      }
      return replace(
        state,
        target.index,
        { ...target.layout, lines: [...target.layout.lines, next] },
        selected('line', next.id),
      );
    },
  };
}

export function updateDrawingLine(
  layoutId: string,
  id: string,
  patch: DrawingLinePatch,
): AppCommand {
  return {
    type: 'annotation.line.update',
    label: 'Update line',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (!target) return state;
      const index = target.layout.lines.findIndex((item) => item.id === id);
      const current = target.layout.lines[index];
      if (index < 0 || !current) return state;
      const next = normalizeDrawingLine(
        { ...current, ...patch, id: current.id },
        index,
        `${layoutId}-line`,
      );
      if (
        next.attachedNoteId &&
        !target.layout.notes.some((note) => note.id === next.attachedNoteId)
      ) {
        return state;
      }
      if (sameJson(current, next)) return state;
      const lines = [...target.layout.lines];
      lines[index] = next;
      return replace(state, target.index, { ...target.layout, lines });
    },
  };
}

export function deleteDrawingLine(
  layoutId: string,
  id: string,
): AppCommand {
  return {
    type: 'annotation.line.delete',
    label: 'Delete line',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (!target || !target.layout.lines.some((item) => item.id === id)) {
        return state;
      }
      return replace(
        state,
        target.index,
        {
          ...target.layout,
          lines: target.layout.lines.filter((item) => item.id !== id),
        },
        clearIfSelected(state, 'line', id),
      );
    },
  };
}

export function addCanvasNote(
  layoutId: string,
  note: CanvasNote,
): AppCommand {
  return {
    type: 'annotation.note.add',
    label: 'Add note',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (
        !target ||
        target.layout.notes.some((item) => item.id === note.id)
      ) {
        return state;
      }
      const next = normalizeCanvasNote(
        note,
        target.layout.notes.length,
        `${layoutId}-note`,
      );
      return replace(
        state,
        target.index,
        { ...target.layout, notes: [...target.layout.notes, next] },
        selected('note', next.id),
      );
    },
  };
}

export function updateCanvasNote(
  layoutId: string,
  id: string,
  patch: CanvasNotePatch,
): AppCommand {
  return {
    type: 'annotation.note.update',
    label: 'Update note',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (!target) return state;
      const index = target.layout.notes.findIndex((item) => item.id === id);
      const current = target.layout.notes[index];
      if (index < 0 || !current) return state;
      const next = normalizeCanvasNote(
        { ...current, ...patch, id: current.id },
        index,
        `${layoutId}-note`,
      );
      if (sameJson(current, next)) return state;

      const notes = [...target.layout.notes];
      notes[index] = next;
      const lines =
        current.x === next.x && current.y === next.y
          ? target.layout.lines
          : syncNoteLeaderLines(next, target.layout.lines);
      return replace(state, target.index, {
        ...target.layout,
        notes,
        lines,
      });
    },
  };
}

export function deleteCanvasNote(
  layoutId: string,
  id: string,
): AppCommand {
  return {
    type: 'annotation.note.delete',
    label: 'Delete note',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (!target || !target.layout.notes.some((item) => item.id === id)) {
        return state;
      }
      const removedLeaderIds = new Set(
        target.layout.lines
          .filter((line) => line.attachedNoteId === id)
          .map((line) => line.id),
      );
      let selection = clearIfSelected(state, 'note', id);
      if (
        selection.kind === 'line' &&
        removedLeaderIds.has(selection.id)
      ) {
        selection = { kind: 'none' };
      }
      return replace(
        state,
        target.index,
        {
          ...target.layout,
          notes: target.layout.notes.filter((item) => item.id !== id),
          lines: target.layout.lines.filter(
            (line) => line.attachedNoteId !== id,
          ),
        },
        selection,
      );
    },
  };
}

export function addNoteLeader(
  layoutId: string,
  noteId: string,
  leader: DrawingLine,
): AppCommand {
  return {
    type: 'annotation.note.leader.add',
    label: 'Add note leader',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      const note = target?.layout.notes.find((item) => item.id === noteId);
      if (
        !target ||
        !note ||
        target.layout.lines.some((item) => item.id === leader.id)
      ) {
        return state;
      }
      const next = normalizeDrawingLine(
        {
          ...leader,
          attachedNoteId: note.id,
          attachedEnd: leader.attachedEnd ?? 'start',
        },
        target.layout.lines.length,
        `${layoutId}-line`,
      );
      const [synced] = syncNoteLeaderLines(note, [next]);
      if (!synced) return state;
      return replace(
        state,
        target.index,
        {
          ...target.layout,
          lines: [...target.layout.lines, synced],
        },
        selected('note', note.id),
      );
    },
  };
}

export function removeNoteLeaders(
  layoutId: string,
  noteId: string,
): AppCommand {
  return {
    type: 'annotation.note.leader.remove',
    label: 'Remove note leader',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const target = designLayout(state, layoutId);
      if (!target || !target.layout.notes.some((item) => item.id === noteId)) {
        return state;
      }
      const removed = new Set(
        target.layout.lines
          .filter((line) => line.attachedNoteId === noteId)
          .map((line) => line.id),
      );
      if (!removed.size) return state;
      const selection =
        state.session.selection.kind === 'line' &&
        removed.has(state.session.selection.id)
          ? ({ kind: 'note', id: noteId } as const)
          : state.session.selection;
      return replace(
        state,
        target.index,
        {
          ...target.layout,
          lines: target.layout.lines.filter(
            (line) => !removed.has(line.id),
          ),
        },
        selection,
      );
    },
  };
}
