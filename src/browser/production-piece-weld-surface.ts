import {
  applyPreparedPieceWeld,
  preparePieceWeld,
  unweldPieces,
  type AppStore,
  type CommandDispatcher,
} from '../app';
import {
  isBacksplashPiece,
  type Piece,
} from '../domain/pieces';

export interface ProductionPieceWeldSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  createId: (prefix: string) => string;
}

type WeldProjection = {
  layoutId: string;
  pieces: Piece[];
  canWeld: boolean;
  weldIds: string[];
  reason: string;
};

function projection(store: AppStore): WeldProjection | null {
  const state = store.getState();
  if (state.session.workspace !== 'design') return null;
  const selection = state.session.selection;
  if (selection.kind !== 'pieces' || selection.ids.length === 0) return null;
  const layout = state.project.layouts.find(
    (item) => item.id === state.session.activeLayoutId,
  );
  if (!layout) return null;

  const ids = new Set(selection.ids);
  const pieces = layout.pieces.filter((piece) => ids.has(piece.id));
  if (!pieces.length) return null;
  const weldIds = [...new Set(
    pieces
      .map((piece) => piece.fabricationWeld?.id ?? '')
      .filter(Boolean),
  )];

  let reason = '';
  if (pieces.length < 2) reason = 'Select at least two Pieces in the same Group.';
  else if (pieces.some(isBacksplashPiece)) reason = 'Linked splashes weld separately.';
  else if (pieces.some((piece) => piece.fabricationWeld)) reason = 'Unweld the current fabrication relationship first.';
  else if (pieces.some((piece) => piece.assemblyLinks.some((link) => link.kind === 'seam'))) reason = 'Seam-linked fabrication Pieces cannot be welded directly.';
  else {
    const groupId = pieces[0]?.pieceGroupId ?? null;
    if (!groupId || pieces.some((piece) => piece.pieceGroupId !== groupId)) {
      reason = 'Selected Pieces must belong to the same Piece Group.';
    }
  }

  return {
    layoutId: layout.id,
    pieces,
    canWeld: !reason,
    weldIds,
    reason,
  };
}

export class ProductionPieceWeldSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly createId: (prefix: string) => string;
  private inspector: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private observer: MutationObserver | null = null;
  private scheduled = false;
  private rendering = false;
  private message = '';

  constructor(options: ProductionPieceWeldSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.createId = options.createId;
  }

  mount(): void {
    if (this.unsubscribe || this.observer) return;
    if (!this.root.querySelector('[data-cad-lite-production-shell]')) return;
    this.inspector = this.root.querySelector<HTMLElement>('#lc-inspector');
    if (!this.inspector) return;

    this.unsubscribe = this.store.subscribe(() => {
      this.message = '';
      this.scheduleRender();
    });
    const Observer = this.inspector.ownerDocument.defaultView?.MutationObserver;
    if (Observer) {
      this.observer = new Observer(() => this.scheduleRender());
      this.observer.observe(this.inspector, { childList: true, subtree: true });
    }
    this.render();
  }

  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.observer?.disconnect();
    this.observer = null;
    this.inspector?.querySelector('[data-production-piece-weld]')?.remove();
    this.inspector = null;
    this.scheduled = false;
    this.rendering = false;
  }

  private scheduleRender(): void {
    if (this.scheduled || this.rendering) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.render();
    });
  }

  private render(): void {
    const inspector = this.inspector;
    if (!inspector || this.rendering) return;
    const model = projection(this.store);
    const signature = model
      ? JSON.stringify({
          ids: model.pieces.map((piece) => piece.id),
          weldIds: model.weldIds,
          canWeld: model.canWeld,
          reason: model.reason,
          message: this.message,
        })
      : '';
    const existing = inspector.querySelector<HTMLElement>('[data-production-piece-weld]');
    if (existing?.dataset.productionPieceWeldSignature === signature) return;

    this.rendering = true;
    try {
      existing?.remove();
      if (!model) return;

      const document = inspector.ownerDocument;
      const section = document.createElement('section');
      section.className = 'lc-production-piece-properties lc-production-piece-weld';
      section.dataset.productionPieceWeld = '1';
      section.dataset.productionPieceWeldSignature = signature;

      const header = document.createElement('div');
      header.className = 'lc-production-piece-properties__header';
      const title = document.createElement('strong');
      title.textContent = 'WELD';
      header.appendChild(title);

      const body = document.createElement('div');
      body.className = 'lc-production-piece-properties__body';

      const help = document.createElement('div');
      help.className = 'lc-hint';
      if (model.weldIds.length) {
        help.textContent = `${model.pieces.length} selected source Piece${model.pieces.length === 1 ? '' : 's'} · welded fabrication perimeter`;
      } else if (model.canWeld) {
        help.textContent = 'Union touching or overlapping grouped Pieces into one stone perimeter.';
      } else {
        help.textContent = model.reason;
      }
      body.appendChild(help);

      if (model.canWeld) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lc-btn primary';
        button.textContent = 'Weld Touching Pieces';
        button.addEventListener('click', async () => {
          button.disabled = true;
          this.message = 'Resolving welded perimeter…';
          this.render();
          const state = this.store.getState();
          const layout = state.project.layouts.find((item) => item.id === model.layoutId);
          if (!layout) return;
          try {
            const result = await preparePieceWeld(
              layout,
              model.pieces.map((piece) => piece.id),
              this.createId('weld'),
            );
            if (!result.ok) {
              this.message = result.reason;
              this.render();
              return;
            }
            this.commands.execute(applyPreparedPieceWeld(model.layoutId, result));
            this.message = '';
          } catch (error) {
            this.message = error instanceof Error ? error.message : 'Weld failed.';
            this.render();
          }
        });
        body.appendChild(button);
      }

      if (model.weldIds.length) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lc-btn ghost';
        button.textContent = 'Unweld';
        button.addEventListener('click', () => {
          this.commands.execute(
            unweldPieces(
              model.layoutId,
              model.pieces.map((piece) => piece.id),
            ),
          );
        });
        body.appendChild(button);
      }

      if (this.message) {
        const status = document.createElement('div');
        status.className = 'lc-hint';
        status.textContent = this.message;
        body.appendChild(status);
      }

      section.append(header, body);
      const anchor = inspector.querySelector(
        ':scope > .lc-piece-shape-inspector, :scope > .lc-piece-sinks-inspector, :scope > .lc-piece-cutouts-inspector, :scope > .lc-piece-seams-inspector',
      );
      inspector.insertBefore(section, anchor);
    } finally {
      this.rendering = false;
    }
  }
}
