import type { Layout, PersistedEntity } from '../../domain/project';
import type { JsonValue } from '../../domain/types';
import type { CommandDispatcher } from '../commands';
import { setSelection } from '../commands/session';
import type { Selection } from '../state';
import type { AppStore } from '../store';

function stringId(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function entityHasId(entities: readonly PersistedEntity[], id: string): boolean {
  return entities.some((entity) => stringId(entity.id) === id);
}

function activeLayout(store: AppStore): Layout | null {
  const state = store.getState();
  return (
    state.project.layouts.find((layout) => layout.id === state.session.activeLayoutId) ??
    null
  );
}

export class SelectionController {
  constructor(
    private readonly store: AppStore,
    private readonly commands: CommandDispatcher,
  ) {}

  getSelection(): Selection {
    return this.store.getState().session.selection;
  }

  clear(): boolean {
    return this.commands.execute(setSelection({ kind: 'none' })) !== null;
  }

  select(selection: Selection): boolean {
    const normalized = this.normalize(selection);
    return this.commands.execute(setSelection(normalized)) !== null;
  }

  selectPiece(id: string, additive = false): boolean {
    const layout = activeLayout(this.store);
    if (!layout || !entityHasId(layout.pieces, id)) return false;

    if (!additive) {
      return this.select({ kind: 'pieces', ids: [id] });
    }

    const current = this.getSelection();
    const ids = current.kind === 'pieces' ? [...current.ids] : [];
    const next = ids.includes(id)
      ? ids.filter((candidate) => candidate !== id)
      : [...ids, id];

    return this.select(next.length > 0 ? { kind: 'pieces', ids: next } : { kind: 'none' });
  }

  selectPieceRange(anchorId: string, targetId: string): boolean {
    const layout = activeLayout(this.store);
    if (!layout) return false;

    const order = layout.pieces
      .map((piece) => stringId(piece.id))
      .filter((id): id is string => id !== null);
    const start = order.indexOf(anchorId);
    const end = order.indexOf(targetId);

    if (start < 0 || end < 0) return false;

    const [from, to] = start <= end ? [start, end] : [end, start];
    return this.select({ kind: 'pieces', ids: order.slice(from, to + 1) });
  }

  selectAllPieces(): boolean {
    const layout = activeLayout(this.store);
    if (!layout) return false;

    const ids = layout.pieces
      .map((piece) => stringId(piece.id))
      .filter((id): id is string => id !== null);

    return this.select(ids.length > 0 ? { kind: 'pieces', ids } : { kind: 'none' });
  }

  sanitize(): boolean {
    return this.select(this.getSelection());
  }

  private normalize(selection: Selection): Selection {
    if (selection.kind === 'none') return selection;

    const state = this.store.getState();
    const layout = activeLayout(this.store);

    if (selection.kind === 'layout') {
      return state.project.layouts.some((item) => item.id === selection.id)
        ? selection
        : { kind: 'none' };
    }

    if (selection.kind === 'material') {
      return state.project.materials.some((item) => item.id === selection.id)
        ? selection
        : { kind: 'none' };
    }

    if (!layout) return { kind: 'none' };

    if (selection.kind === 'pieces') {
      const available = new Set(
        layout.pieces
          .map((piece) => stringId(piece.id))
          .filter((id): id is string => id !== null),
      );
      const ids = Array.from(new Set(selection.ids)).filter((id) => available.has(id));
      return ids.length > 0 ? { kind: 'pieces', ids } : { kind: 'none' };
    }

    if (selection.kind === 'area') {
      return layout.areas.some((area) => area.id === selection.id)
        ? selection
        : { kind: 'none' };
    }

    if (selection.kind === 'dimension') {
      return entityHasId(layout.dims, selection.id) ? selection : { kind: 'none' };
    }

    if (selection.kind === 'line') {
      return entityHasId(layout.lines, selection.id) ? selection : { kind: 'none' };
    }

    if (selection.kind === 'note') {
      return entityHasId(layout.notes, selection.id) ? selection : { kind: 'none' };
    }

    if (selection.kind === 'roomFeature') {
      return entityHasId(layout.roomFeatures, selection.id)
        ? selection
        : { kind: 'none' };
    }

    if (selection.kind === 'slab') {
      return entityHasId(layout.overlays, selection.id) ? selection : { kind: 'none' };
    }

    if (selection.kind === 'pieceGroup') {
      return layout.pieces.some(
        (piece) => piece.pieceGroupId === selection.id,
      )
        ? selection
        : { kind: 'none' };
    }

    return { kind: 'none' };
  }
}
