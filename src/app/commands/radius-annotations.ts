import { formatRadiusLabel } from '../../core/format-inches';
import {
  normalizeCanvasNote,
  normalizeDrawingLine,
} from '../../domain/annotations';
import {
  findRadiusNote,
  radiusLabelPosition,
  resolveRadiusTarget,
  type RadiusCorner,
  type RadiusLabelPlacement,
  type RadiusReference,
} from '../../domain/annotations/radius';
import type { Layout } from '../../domain/project';
import type { ReadonlyApplicationState } from '../state';
import type { AppCommand } from './types';

export type RadiusReferenceSeed =
  | {
      kind: 'piece';
      pieceId: string;
      corner: RadiusCorner;
    }
  | {
      kind: 'sink';
      pieceId: string;
      sinkId: string;
      corner: RadiusCorner;
    };

export interface RadiusAnnotationIds {
  noteId: string;
  lineId: string;
}

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
  const index = state.project.layouts.findIndex((layout) => layout.id === layoutId);
  const layout = state.project.layouts[index];
  return index >= 0 && layout ? { layout, index } : null;
}

function referenceFromSeed(
  seed: RadiusReferenceSeed,
  target: { x: number; y: number },
): RadiusReference {
  const common = {
    pieceId: seed.pieceId,
    corner: seed.corner,
    autoText: true,
    lastTarget: { x: target.x, y: target.y },
  };
  return seed.kind === 'sink'
    ? { kind: 'sink', sinkId: seed.sinkId, ...common }
    : { kind: 'piece', ...common };
}

function referenceForLookup(seed: RadiusReferenceSeed): RadiusReference {
  return referenceFromSeed(seed, { x: 0, y: 0 });
}

function replaceLayout(
  state: ReadonlyApplicationState,
  index: number,
  layout: Layout,
  pieceId: string,
) {
  const layouts = [...state.project.layouts];
  layouts[index] = layout;
  return {
    ...state,
    project: { ...state.project, layouts },
    session: {
      ...state.session,
      selection: { kind: 'pieces' as const, ids: [pieceId] },
    },
  };
}

export function addRadiusAnnotation(
  layoutId: string,
  seed: RadiusReferenceSeed,
  ids: RadiusAnnotationIds,
  placement: RadiusLabelPlacement = 'outside',
): AppCommand {
  const input = { ...seed } as RadiusReferenceSeed;
  const preparedIds = {
    noteId: ids.noteId.trim(),
    lineId: ids.lineId.trim(),
  };
  return {
    type: 'annotation.radius.add',
    label: 'Add radius label',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const targetLayout = designLayout(state, layoutId);
      if (!targetLayout || !preparedIds.noteId || !preparedIds.lineId) return state;
      const { layout, index } = targetLayout;
      if (
        layout.notes.some((note) => note.id === preparedIds.noteId) ||
        layout.lines.some((line) => line.id === preparedIds.lineId) ||
        findRadiusNote(layout, referenceForLookup(input))
      ) {
        return state;
      }

      const target = resolveRadiusTarget(layout, referenceForLookup(input));
      if (!target) return state;
      const reference = referenceFromSeed(input, target);
      const point = radiusLabelPosition(layout, target, placement);
      const text = formatRadiusLabel(
        target.radius,
        state.preferences.dimFormat,
        state.preferences.dimPrecision,
      );

      const note = normalizeCanvasNote(
        {
          id: preparedIds.noteId,
          x: point.x,
          y: point.y,
          text,
          annotationType: 'radius',
          radiusRef: reference,
        },
        layout.notes.length,
        `${layoutId}-note`,
      );
      const line = normalizeDrawingLine(
        {
          id: preparedIds.lineId,
          name: input.kind === 'sink' ? 'Sink Radius Leader' : 'Radius Leader',
          x1: point.x,
          y1: point.y,
          x2: target.x,
          y2: target.y,
          style: 'solid',
          color: '#111111',
          thickness: 2,
          startCap: 'none',
          endCap: 'arrow',
          attachedNoteId: note.id,
          attachedEnd: 'start',
          visible: true,
          annotationType: 'radius',
          radiusRef: reference,
        },
        layout.lines.length,
        `${layoutId}-line`,
      );

      return replaceLayout(
        state,
        index,
        {
          ...layout,
          notes: [...layout.notes, note],
          lines: [...layout.lines, line],
        },
        input.pieceId,
      );
    },
  };
}

export function removeRadiusAnnotation(
  layoutId: string,
  seed: RadiusReferenceSeed,
): AppCommand {
  const input = { ...seed } as RadiusReferenceSeed;
  return {
    type: 'annotation.radius.delete',
    label: 'Delete radius label',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const targetLayout = designLayout(state, layoutId);
      if (!targetLayout) return state;
      const { layout, index } = targetLayout;
      const note = findRadiusNote(layout, referenceForLookup(input));
      if (!note) return state;
      return replaceLayout(
        state,
        index,
        {
          ...layout,
          notes: layout.notes.filter((item) => item.id !== note.id),
          lines: layout.lines.filter((line) => line.attachedNoteId !== note.id),
        },
        input.pieceId,
      );
    },
  };
}
