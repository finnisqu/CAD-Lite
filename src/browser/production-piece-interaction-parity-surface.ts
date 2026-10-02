import {
  reorderPieceSink,
  setSelection,
  type AppStore,
  type CommandDispatcher,
} from '../app';
import { createPieceGroupProjection } from '../domain/pieces';

export interface ProductionPieceInteractionParitySurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
}

export function mergePieceRangeSelection(
  pieceIds: readonly string[],
  currentIds: readonly string[],
  anchorIndex: number,
  targetIndex: number,
): string[] {
  if (
    anchorIndex < 0 ||
    targetIndex < 0 ||
    anchorIndex >= pieceIds.length ||
    targetIndex >= pieceIds.length
  ) {
    return [...currentIds];
  }

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return [
    ...new Set([
      ...currentIds,
      ...pieceIds.slice(start, end + 1),
    ]),
  ];
}

interface SinkDragState {
  layoutId: string;
  pieceId: string;
  sinkId: string;
}

export class ProductionPieceInteractionParitySurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;

  private abort: AbortController | null = null;
  private observer: MutationObserver | null = null;
  private anchorLayoutId: string | null = null;
  private lastPieceSelectionIndex = -1;
  private sinkDrag: SinkDragState | null = null;

  constructor(options: ProductionPieceInteractionParitySurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
  }

  mount(): void {
    if (this.abort) return;

    const pieces = this.root.querySelector<HTMLElement>('#lc-pieces');
    const inspector = this.root.querySelector<HTMLElement>('#lc-inspector');
    if (!pieces || !inspector) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;

    pieces.addEventListener(
      'click',
      (event) => this.onPieceListClick(event),
      { signal, capture: true },
    );

    inspector.addEventListener(
      'dragstart',
      (event) => this.onSinkDragStart(event),
      { signal },
    );
    inspector.addEventListener(
      'dragover',
      (event) => this.onSinkDragOver(event),
      { signal },
    );
    inspector.addEventListener(
      'drop',
      (event) => this.onSinkDrop(event),
      { signal },
    );
    inspector.addEventListener(
      'dragend',
      () => this.clearSinkDrag(),
      { signal },
    );

    const MutationObserverCtor =
      inspector.ownerDocument.defaultView?.MutationObserver ??
      globalThis.MutationObserver;
    if (MutationObserverCtor) {
      this.observer = new MutationObserverCtor(() => this.decorateSinkRows());
      this.observer.observe(inspector, { childList: true, subtree: true });
    }
    this.decorateSinkRows();
  }

  unmount(): void {
    this.abort?.abort();
    this.abort = null;
    this.observer?.disconnect();
    this.observer = null;
    this.anchorLayoutId = null;
    this.lastPieceSelectionIndex = -1;
    this.clearSinkDrag();
  }

  private activeLayout() {
    const state = this.store.getState();
    return state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null;
  }

  private syncAnchorLayout(layoutId: string): void {
    if (this.anchorLayoutId === layoutId) return;
    this.anchorLayoutId = layoutId;
    this.lastPieceSelectionIndex = -1;
  }

  private onPieceListClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const layout = this.activeLayout();
    if (!layout) return;
    this.syncAnchorLayout(layout.id);

    const groupHeader = target.closest<HTMLElement>('[data-piece-group-header]');
    if (groupHeader) {
      const groupId = groupHeader.dataset.pieceGroupHeader;
      const group = createPieceGroupProjection(layout.pieces).find(
        (candidate) => candidate.id === groupId,
      );
      if (group?.memberIds.length) {
        this.lastPieceSelectionIndex = Math.max(
          0,
          ...group.memberIds.map((id) =>
            layout.pieces.findIndex((piece) => piece.id === id),
          ),
        );
      }
      return;
    }

    const pieceRow = target.closest<HTMLElement>('[data-piece-id]');
    const pieceId = pieceRow?.dataset.pieceId;
    if (!pieceId) return;

    const index = layout.pieces.findIndex((piece) => piece.id === pieceId);
    if (index < 0) return;

    // v1.5.99 Ctrl/Cmd toggle does not move the Shift-range anchor.
    if (event.ctrlKey || event.metaKey) return;

    if (event.shiftKey && this.lastPieceSelectionIndex >= 0) {
      const selection = this.store.getState().session.selection;
      const currentIds = selection.kind === 'pieces' ? selection.ids : [];
      const ids = mergePieceRangeSelection(
        layout.pieces.map((piece) => piece.id),
        currentIds,
        this.lastPieceSelectionIndex,
        index,
      );

      event.preventDefault();
      event.stopPropagation();
      this.commands.execute(
        setSelection(ids.length ? { kind: 'pieces', ids } : { kind: 'none' }),
      );
      return;
    }

    this.lastPieceSelectionIndex = index;
  }

  private selectedSinkContext() {
    const state = this.store.getState();
    const selection = state.session.selection;
    if (selection.kind !== 'pieces' || selection.ids.length !== 1) return null;

    const layout = state.project.layouts.find(
      (candidate) => candidate.id === state.session.activeLayoutId,
    );
    const piece = layout?.pieces.find(
      (candidate) => candidate.id === selection.ids[0],
    );
    return layout && piece ? { layout, piece } : null;
  }

  private sinkRows(): HTMLElement[] {
    return Array.from(
      this.root.querySelectorAll<HTMLElement>(
        '#lc-inspector .lc-piece-sink-row',
      ),
    );
  }

  private decorateSinkRows(): void {
    const rows = this.sinkRows();
    if (rows.length < 2) return;

    rows.forEach((row) => {
      const header = row.querySelector<HTMLElement>(
        '.lc-piece-sink-row__header',
      );
      if (!header || header.querySelector('[data-sink-reorder-handle]')) return;

      const handle = header.ownerDocument.createElement('button');
      handle.type = 'button';
      handle.className = 'lc-sink-reorder-handle';
      handle.draggable = true;
      handle.dataset.sinkReorderHandle = 'true';
      handle.title = 'Drag to reorder sink';
      handle.setAttribute('aria-label', 'Drag to reorder sink');
      handle.textContent = '⋮⋮';
      header.prepend(handle);
    });
  }

  private onSinkDragStart(event: DragEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const handle = target.closest<HTMLElement>('[data-sink-reorder-handle]');
    if (!handle) return;

    const row = handle.closest<HTMLElement>('.lc-piece-sink-row');
    const rows = this.sinkRows();
    const index = row ? rows.indexOf(row) : -1;
    const context = this.selectedSinkContext();
    const sink = index >= 0 ? context?.piece.sinks[index] : null;
    if (!row || !context || !sink) {
      event.preventDefault();
      return;
    }

    this.sinkDrag = {
      layoutId: context.layout.id,
      pieceId: context.piece.id,
      sinkId: sink.id,
    };
    row.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', sink.id);
    }
  }

  private onSinkDragOver(event: DragEvent): void {
    if (!this.sinkDrag) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('.lc-piece-sink-row');
    if (!row) return;

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.sinkRows().forEach((candidate) =>
      candidate.classList.toggle('is-drop-target', candidate === row),
    );
  }

  private onSinkDrop(event: DragEvent): void {
    const drag = this.sinkDrag;
    if (!drag) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('.lc-piece-sink-row');
    if (!row) return;

    const targetIndex = this.sinkRows().indexOf(row);
    if (targetIndex < 0) return;

    event.preventDefault();
    this.commands.execute(
      reorderPieceSink(
        drag.layoutId,
        drag.pieceId,
        drag.sinkId,
        targetIndex,
      ),
    );
    this.clearSinkDrag();
  }

  private clearSinkDrag(): void {
    this.sinkDrag = null;
    this.sinkRows().forEach((row) => {
      row.classList.remove('is-dragging', 'is-drop-target');
    });
  }
}
