import {
  reorderPieceCutout,
  type AppStore,
  type CommandDispatcher,
} from '../app';

export interface ProductionCutoutInteractionParitySurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
}

interface CutoutDragState {
  layoutId: string;
  pieceId: string;
  cutoutId: string;
}

export class ProductionCutoutInteractionParitySurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;

  private abort: AbortController | null = null;
  private observer: MutationObserver | null = null;
  private drag: CutoutDragState | null = null;
  private readonly openByPiece = new Map<string, string>();
  private readonly knownIdsByPiece = new Map<string, string[]>();

  constructor(options: ProductionCutoutInteractionParitySurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
  }

  mount(): void {
    if (this.abort) return;
    const inspector = this.root.querySelector<HTMLElement>('#lc-inspector');
    if (!inspector) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    inspector.addEventListener('click', (event) => this.onClick(event), { signal });
    inspector.addEventListener('dragstart', (event) => this.onDragStart(event), { signal });
    inspector.addEventListener('dragover', (event) => this.onDragOver(event), { signal });
    inspector.addEventListener('drop', (event) => this.onDrop(event), { signal });
    inspector.addEventListener('dragend', () => this.clearDrag(), { signal });

    const MutationObserverCtor =
      inspector.ownerDocument.defaultView?.MutationObserver ??
      globalThis.MutationObserver;
    if (MutationObserverCtor) {
      this.observer = new MutationObserverCtor(() => this.decorate());
      this.observer.observe(inspector, { childList: true, subtree: true });
    }
    this.decorate();
  }

  unmount(): void {
    this.abort?.abort();
    this.abort = null;
    this.observer?.disconnect();
    this.observer = null;
    this.drag = null;
    this.openByPiece.clear();
    this.knownIdsByPiece.clear();
    this.clearDrag();
  }

  private selectedContext() {
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

  private rows(): HTMLElement[] {
    return Array.from(
      this.root.querySelectorAll<HTMLElement>(
        '#lc-inspector .lc-piece-cutout-row',
      ),
    );
  }

  private onClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('button,input,select,textarea,[data-cutout-reorder-handle]')) {
      return;
    }

    const header = target.closest<HTMLElement>('.lc-piece-cutout-row__header');
    const row = header?.closest<HTMLElement>('.lc-piece-cutout-row');
    if (!header || !row) return;
    const context = this.selectedContext();
    const index = this.rows().indexOf(row);
    const cutout = index >= 0 ? context?.piece.cutouts[index] : null;
    if (!context || !cutout) return;

    if (this.openByPiece.get(context.piece.id) === cutout.id) {
      this.openByPiece.delete(context.piece.id);
    } else {
      this.openByPiece.set(context.piece.id, cutout.id);
    }
    this.decorate();
  }

  private decorate(): void {
    const context = this.selectedContext();
    const rows = this.rows();
    if (!context || !rows.length) return;

    const pieceId = context.piece.id;
    const ids = context.piece.cutouts.map((cutout) => cutout.id);
    const previousIds = this.knownIdsByPiece.get(pieceId);
    if (previousIds && ids.length > previousIds.length) {
      const addedId = ids.find((id) => !previousIds.includes(id));
      if (addedId) this.openByPiece.set(pieceId, addedId);
    }
    this.knownIdsByPiece.set(pieceId, [...ids]);

    const currentOpen = this.openByPiece.get(pieceId);
    if (currentOpen && !ids.includes(currentOpen)) {
      this.openByPiece.delete(pieceId);
    }
    const openId = this.openByPiece.get(pieceId) ?? null;

    rows.forEach((row, index) => {
      const cutout = context.piece.cutouts[index];
      if (!cutout) return;
      row.dataset.cutoutParityId = cutout.id;
      row.classList.toggle('is-expanded', cutout.id === openId);

      const header = row.querySelector<HTMLElement>('.lc-piece-cutout-row__header');
      if (!header || rows.length < 2 || header.querySelector('[data-cutout-reorder-handle]')) {
        return;
      }

      const handle = header.ownerDocument.createElement('button');
      handle.type = 'button';
      handle.className = 'lc-cutout-reorder-handle';
      handle.draggable = true;
      handle.dataset.cutoutReorderHandle = 'true';
      handle.title = 'Drag to reorder cutout';
      handle.setAttribute('aria-label', 'Drag to reorder cutout');
      handle.textContent = '⋮⋮';
      header.prepend(handle);
    });
  }

  private onDragStart(event: DragEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const handle = target.closest<HTMLElement>('[data-cutout-reorder-handle]');
    if (!handle) return;

    const row = handle.closest<HTMLElement>('.lc-piece-cutout-row');
    const rows = this.rows();
    const index = row ? rows.indexOf(row) : -1;
    const context = this.selectedContext();
    const cutout = index >= 0 ? context?.piece.cutouts[index] : null;
    if (!row || !context || !cutout) {
      event.preventDefault();
      return;
    }

    this.drag = {
      layoutId: context.layout.id,
      pieceId: context.piece.id,
      cutoutId: cutout.id,
    };
    row.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', cutout.id);
    }
  }

  private onDragOver(event: DragEvent): void {
    if (!this.drag) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('.lc-piece-cutout-row');
    if (!row) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.rows().forEach((candidate) =>
      candidate.classList.toggle('is-drop-target', candidate === row),
    );
  }

  private onDrop(event: DragEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('.lc-piece-cutout-row');
    if (!row) return;
    const targetIndex = this.rows().indexOf(row);
    if (targetIndex < 0) return;

    event.preventDefault();
    this.commands.execute(
      reorderPieceCutout(
        drag.layoutId,
        drag.pieceId,
        drag.cutoutId,
        targetIndex,
      ),
    );
    this.clearDrag();
  }

  private clearDrag(): void {
    this.drag = null;
    this.rows().forEach((row) => {
      row.classList.remove('is-dragging', 'is-drop-target');
    });
  }
}
