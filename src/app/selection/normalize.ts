import type { Layout, PersistedEntity } from '../../domain/project';
import type { JsonValue } from '../../domain/types';
import type { ReadonlyApplicationState, Selection } from '../state';

function stringId(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function entityHasId(entities: readonly PersistedEntity[], id: string): boolean {
  return entities.some((entity) => stringId(entity.id) === id);
}

export function activeLayoutForState(
  state: ReadonlyApplicationState,
): Layout | null {
  return (
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null
  );
}

export function normalizeSelection(
  state: ReadonlyApplicationState,
  selection: Selection,
): Selection {
  if (selection.kind === 'none' || selection.kind === 'materialCollection') {
    return selection;
  }

  const layout = activeLayoutForState(state);

  if (selection.kind === 'layout') {
    return state.project.layouts.some((item) => item.id === selection.id)
      ? selection
      : { kind: 'none' };
  }

  if (selection.kind === 'material') {
    if (state.project.materials.some((item) => item.id === selection.id)) {
      return selection;
    }
    const firstMaterial = state.project.materials[0];
    return firstMaterial
      ? { kind: 'material', id: firstMaterial.id }
      : { kind: 'materialCollection' };
  }

  if (!layout) return { kind: 'none' };

  if (selection.kind === 'pieces') {
    const available = new Set(
      layout.pieces
        .map((piece) => stringId(piece.id))
        .filter((id): id is string => id !== null),
    );
    const ids = Array.from(new Set(selection.ids)).filter((id) =>
      available.has(id),
    );
    return ids.length > 0 ? { kind: 'pieces', ids } : { kind: 'none' };
  }

  if (selection.kind === 'area') {
    return layout.areas.some((area) => area.id === selection.id)
      ? selection
      : { kind: 'none' };
  }

  if (selection.kind === 'dimension') {
    return entityHasId(layout.dims, selection.id)
      ? selection
      : { kind: 'none' };
  }

  if (selection.kind === 'line') {
    return entityHasId(layout.lines, selection.id)
      ? selection
      : { kind: 'none' };
  }

  if (selection.kind === 'note') {
    return entityHasId(layout.notes, selection.id)
      ? selection
      : { kind: 'none' };
  }

  if (selection.kind === 'roomFeature') {
    return entityHasId(layout.roomFeatures, selection.id)
      ? selection
      : { kind: 'none' };
  }

  if (selection.kind === 'slab') {
    return entityHasId(layout.overlays, selection.id)
      ? selection
      : { kind: 'none' };
  }

  if (selection.kind === 'pieceGroup') {
    return layout.pieces.some((piece) => piece.pieceGroupId === selection.id)
      ? selection
      : { kind: 'none' };
  }

  return { kind: 'none' };
}
