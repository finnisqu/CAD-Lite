import { normalizeSelection, activeLayoutForState } from './normalize';
import type { CommandDispatcher } from '../commands';
import { setSelection } from '../commands/session';
import type { Selection } from '../state';
import type { AppStore } from '../store';

function entityId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
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
    const normalized = normalizeSelection(this.store.getState(), selection);
    return this.commands.execute(setSelection(normalized)) !== null;
  }

  selectPiece(id: string, additive = false): boolean {
    const layout = activeLayoutForState(this.store.getState());
    if (
      !layout ||
      !layout.pieces.some((piece) => entityId(piece.id) === id)
    ) {
      return false;
    }

    if (!additive) {
      return this.select({ kind: 'pieces', ids: [id] });
    }

    const current = this.getSelection();
    const ids = current.kind === 'pieces' ? [...current.ids] : [];
    const next = ids.includes(id)
      ? ids.filter((candidate) => candidate !== id)
      : [...ids, id];

    return this.select(
      next.length > 0 ? { kind: 'pieces', ids: next } : { kind: 'none' },
    );
  }

  selectPieceRange(anchorId: string, targetId: string): boolean {
    const layout = activeLayoutForState(this.store.getState());
    if (!layout) return false;

    const order = layout.pieces
      .map((piece) => entityId(piece.id))
      .filter((id): id is string => id !== null);
    const start = order.indexOf(anchorId);
    const end = order.indexOf(targetId);

    if (start < 0 || end < 0) return false;

    const [from, to] = start <= end ? [start, end] : [end, start];
    return this.select({ kind: 'pieces', ids: order.slice(from, to + 1) });
  }

  selectAllPieces(): boolean {
    const layout = activeLayoutForState(this.store.getState());
    if (!layout) return false;

    const ids = layout.pieces
      .map((piece) => entityId(piece.id))
      .filter((id): id is string => id !== null);

    return this.select(
      ids.length > 0 ? { kind: 'pieces', ids } : { kind: 'none' },
    );
  }

  sanitize(): boolean {
    return this.select(this.getSelection());
  }
}
