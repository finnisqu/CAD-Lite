import {
  deleteCanvasNote,
  deleteDimension,
  deleteDrawingLine,
  deletePieces,
  deleteRoomFeature,
  deleteSlabSurface,
  type CommandDispatcher,
} from './commands';
import type { AppStore } from './store';

/**
 * Delete the currently selected canvas entity through the existing typed
 * commands. This is the shared command path for keyboard and production-shell
 * deletion so annotation and non-annotation selection semantics cannot drift.
 */
export function deleteCanvasSelection(
  store: AppStore,
  commands: CommandDispatcher,
): boolean {
  const state = store.getState();
  const layoutId = state.session.activeLayoutId;
  if (!layoutId) return false;

  const selection = state.session.selection;
  const changed =
    selection.kind === 'pieces'
      ? commands.execute(deletePieces(layoutId, selection.ids))
      : selection.kind === 'dimension'
        ? commands.execute(deleteDimension(layoutId, selection.id))
        : selection.kind === 'line'
          ? commands.execute(deleteDrawingLine(layoutId, selection.id))
          : selection.kind === 'note'
            ? commands.execute(deleteCanvasNote(layoutId, selection.id))
            : selection.kind === 'roomFeature'
              ? commands.execute(deleteRoomFeature(layoutId, selection.id))
              : selection.kind === 'slab'
                ? commands.execute(deleteSlabSurface(layoutId, selection.id))
                : null;

  return changed !== null;
}
