import {
  deletePieces,
  deleteRoomFeature,
  deleteSlabSurface,
  setSelection,
  type AppStore,
  type CanvasSelectionActions,
  type CommandDispatcher,
  type HistoryManager,
  type RoomFeatureNudgeController,
  type ToolController,
} from '../app';

export type CanvasHistoryShortcut = 'undo' | 'redo' | null;

export function canvasHistoryShortcut(
  key: string,
  shiftKey: boolean,
): CanvasHistoryShortcut {
  const normalized = key.toLowerCase();
  if (normalized === 'z' && !shiftKey) return 'undo';
  if (normalized === 'y' || (normalized === 'z' && shiftKey)) return 'redo';
  return null;
}

export interface CanvasKeyboardSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  actions: CanvasSelectionActions;
  history: HistoryManager;
  roomFeatureNudge: RoomFeatureNudgeController;
  tools: ToolController;
}

/**
 * Owns production-level canvas shortcuts that are not tool-specific pointer
 * interactions. Piece arrow nudging remains in PieceCanvasSurface; this adapter
 * owns history, selection clipboard, Room Feature nudge, duplicate, workspace
 * toggle, Escape, and entity deletion parity.
 */
export class CanvasKeyboardSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly actions: CanvasSelectionActions;
  private readonly history: HistoryManager;
  private readonly roomFeatureNudge: RoomFeatureNudgeController;
  private readonly tools: ToolController;
  private abort: AbortController | null = null;

  constructor(options: CanvasKeyboardSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.actions = options.actions;
    this.history = options.history;
    this.roomFeatureNudge = options.roomFeatureNudge;
    this.tools = options.tools;
  }

  mount(): void {
    if (this.abort) return;
    const document =
      this.root instanceof Document
        ? this.root
        : this.root.ownerDocument;
    const view = document?.defaultView;
    if (!view) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    view.addEventListener('keydown', (event) => this.onKeyDown(event), {
      signal,
    });
    view.addEventListener('keyup', (event) => this.onKeyUp(event), {
      signal,
    });
  }

  unmount(): void {
    this.roomFeatureNudge.cancel();
    this.abort?.abort();
    this.abort = null;
  }

  private editableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest('input,textarea,select,[contenteditable="true"]'),
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Tool and Piece interaction listeners are mounted first. When they own a
    // key (active tool, annotation delete, Piece nudge), honor that decision.
    if (event.defaultPrevented || this.editableTarget(event.target)) return;

    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;

    if (command && !event.altKey) {
      const historyShortcut = canvasHistoryShortcut(key, event.shiftKey);
      if (historyShortcut) {
        // v1.5.99 suppresses the browser's own Undo/Redo even at the ends of
        // CAD Lite history, then conditionally applies the editor history step.
        event.preventDefault();
        if (historyShortcut === 'undo') this.history.undo();
        else this.history.redo();
        return;
      }

      const handled =
        key === 'a'
          ? this.actions.selectAllPieces()
          : key === 'c'
            ? this.actions.copy()
            : key === 'v'
              ? this.actions.paste()
              : key === 'd'
                ? this.actions.duplicate()
                : false;
      if (handled) event.preventDefault();
      return;
    }

    if (
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.shiftKey &&
      key === 'q'
    ) {
      if (this.tools.toggleWorkspace()) event.preventDefault();
      return;
    }

    if (event.key === 'Escape') {
      if (this.commands.execute(setSelection({ kind: 'none' }))) {
        event.preventDefault();
      }
      return;
    }

    if (
      this.roomFeatureNudge.nudgeKeyDown(event.key, event.shiftKey)
    ) {
      event.preventDefault();
      return;
    }

    if (event.key !== 'Delete' && event.key !== 'Backspace') return;

    const state = this.store.getState();
    const layoutId = state.session.activeLayoutId;
    if (!layoutId) return;
    const selection = state.session.selection;

    const changed =
      selection.kind === 'pieces'
        ? this.commands.execute(deletePieces(layoutId, selection.ids))
        : selection.kind === 'roomFeature'
          ? this.commands.execute(deleteRoomFeature(layoutId, selection.id))
          : selection.kind === 'slab'
            ? this.commands.execute(deleteSlabSurface(layoutId, selection.id))
            : null;

    if (changed) event.preventDefault();
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.defaultPrevented || this.editableTarget(event.target)) return;
    if (this.roomFeatureNudge.nudgeKeyUp(event.key)) {
      event.preventDefault();
    }
  }
}
