import {
  applyPreparedPieceShapeEdit,
  pieceShapeEditEligibility,
  preparePieceRectangleShapeEdit,
  type AppStore,
  type CommandDispatcher,
  type PieceShapeRectangle,
  type PieceShapeRectangleOperation,
} from '../app';
import {
  clientPointToViewportPoint,
  rotatePointAround,
  type Point,
} from '../geometry';
import {
  createPieceCanvasProjection,
  type PieceCanvasItem,
  type PieceCanvasProjection,
} from './piece-canvas-model';

export interface PieceShapeEditSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
}

interface PieceShapeDrag {
  pointerId: number;
  layoutId: string;
  pieceId: string;
  start: Point;
  current: Point;
}

export function pieceShapeRectangleFromDrag(
  start: Point,
  current: Point,
): PieceShapeRectangle {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    w: Math.abs(current.x - start.x),
    h: Math.abs(current.y - start.y),
  };
}

export function pieceShapeLocalPoint(
  piece: Pick<PieceCanvasItem, 'center' | 'localRect' | 'renderRotation'>,
  canvasPoint: Point,
): Point {
  const unrotated = rotatePointAround(
    canvasPoint,
    piece.center,
    -piece.renderRotation,
  );
  return {
    x: unrotated.x - piece.localRect.x,
    y: unrotated.y - piece.localRect.y,
  };
}

export function pieceShapeCanvasPoint(
  piece: Pick<PieceCanvasItem, 'center' | 'localRect' | 'renderRotation'>,
  localPoint: Point,
): Point {
  return rotatePointAround(
    {
      x: piece.localRect.x + localPoint.x,
      y: piece.localRect.y + localPoint.y,
    },
    piece.center,
    piece.renderRotation,
  );
}

export class PieceShapeEditSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;

  private abort: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private svg: SVGSVGElement | null = null;
  private mode: PieceShapeRectangleOperation | null = null;
  private drag: PieceShapeDrag | null = null;
  private busy = false;
  private status = '';
  private addButton: HTMLButtonElement | null = null;
  private subtractButton: HTMLButtonElement | null = null;
  private toolMount: HTMLElement | null = null;

  constructor(options: PieceShapeEditSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
  }

  mount(): void {
    if (this.abort) return;
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    if (!this.svg) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.installToolControls(signal);

    this.svg.addEventListener(
      'pointerdown',
      (event) => this.onPointerDown(event),
      { signal, capture: true },
    );
    this.svg.addEventListener(
      'pointermove',
      (event) => this.onPointerMove(event),
      { signal, capture: true },
    );
    this.svg.addEventListener(
      'pointerup',
      (event) => this.onPointerUp(event),
      { signal, capture: true },
    );
    this.svg.addEventListener(
      'pointercancel',
      (event) => this.onPointerCancel(event),
      { signal, capture: true },
    );

    this.svg.ownerDocument.defaultView?.addEventListener(
      'keydown',
      (event) => this.onKeyDown(event),
      { signal, capture: true },
    );

    this.unsubscribe = this.store.subscribe(() => this.onStoreChange());
    this.syncControls();
  }

  unmount(): void {
    this.cancelMode();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.abort?.abort();
    this.abort = null;
    this.toolMount?.remove();
    this.toolMount = null;
    this.addButton = null;
    this.subtractButton = null;
    this.svg = null;
  }

  private installToolControls(signal: AbortSignal): void {
    const trigger = this.root.querySelector<HTMLElement>('#lc-insert-menu-btn');
    const menu = trigger?.closest<HTMLElement>('[data-cad-lite-menu]');
    const panel = menu?.querySelector<HTMLElement>('[data-cad-lite-menu-panel]');
    if (!panel || panel.querySelector('[data-piece-shape-tools]')) return;

    const document = panel.ownerDocument;
    const mount = document.createElement('div');
    mount.dataset.pieceShapeTools = '1';

    const heading = document.createElement('div');
    heading.className = 'cad-lite-production-shell__menu-heading';
    heading.textContent = 'Piece Shape';

    const add = document.createElement('button');
    add.id = 'lc-tool-piece-shape-add';
    add.type = 'button';
    add.setAttribute('role', 'menuitem');
    add.textContent = 'Add Rectangle to Piece';
    add.addEventListener('click', () => this.toggleMode('add'), { signal });

    const subtract = document.createElement('button');
    subtract.id = 'lc-tool-piece-shape-subtract';
    subtract.type = 'button';
    subtract.setAttribute('role', 'menuitem');
    subtract.textContent = 'Subtract Rectangle from Piece';
    subtract.addEventListener('click', () => this.toggleMode('subtract'), { signal });

    mount.append(heading, add, subtract);
    const slabHeading = Array.from(panel.children).find(
      (child) =>
        child instanceof HTMLElement &&
        child.classList.contains('cad-lite-production-shell__menu-heading') &&
        child.textContent?.trim() === 'SLAB',
    );
    if (slabHeading) panel.insertBefore(mount, slabHeading);
    else panel.append(mount);

    this.toolMount = mount;
    this.addButton = add;
    this.subtractButton = subtract;
  }

  private selectedContext(): {
    projection: PieceCanvasProjection;
    item: PieceCanvasItem;
  } | null {
    const state = this.store.getState();
    if (state.session.workspace !== 'design') return null;
    if (state.session.interaction.activeTool) return null;
    const selection = state.session.selection;
    if (selection.kind !== 'pieces' || selection.ids.length !== 1) return null;
    const layout = state.project.layouts.find(
      (candidate) => candidate.id === state.session.activeLayoutId,
    );
    const piece = layout?.pieces.find(
      (candidate) => candidate.id === selection.ids[0],
    );
    if (!layout || !piece || !pieceShapeEditEligibility(layout, piece).ok) {
      return null;
    }

    const projection = createPieceCanvasProjection(state);
    const item = projection.pieces.find((candidate) => candidate.id === piece.id);
    return item ? { projection, item } : null;
  }

  private eligibilityReason(): string {
    const state = this.store.getState();
    if (state.session.workspace !== 'design') return 'Shape editing is available in DESIGN.';
    if (state.session.interaction.activeTool) return 'Exit the current drawing mode first.';
    const selection = state.session.selection;
    if (selection.kind !== 'pieces' || selection.ids.length !== 1) {
      return 'Select exactly one Piece to edit its shape.';
    }
    const layout = state.project.layouts.find(
      (candidate) => candidate.id === state.session.activeLayoutId,
    );
    const piece = layout?.pieces.find((candidate) => candidate.id === selection.ids[0]);
    if (!layout || !piece) return 'Select exactly one Piece to edit its shape.';
    const eligibility = pieceShapeEditEligibility(layout, piece);
    return eligibility.ok ? '' : eligibility.reason;
  }

  private toggleMode(operation: PieceShapeRectangleOperation): void {
    if (this.busy) return;
    if (this.mode === operation) {
      this.cancelMode();
      return;
    }
    if (!this.selectedContext()) {
      this.status = this.eligibilityReason();
      this.syncControls();
      return;
    }

    this.mode = operation;
    this.drag = null;
    this.status = '';
    if (this.svg) this.svg.style.cursor = 'crosshair';
    this.syncControls();
    this.renderHud();
  }

  private cancelMode(): void {
    this.mode = null;
    this.drag = null;
    this.busy = false;
    this.status = '';
    this.removePreview();
    this.removeHud();
    if (this.svg) this.svg.style.cursor = '';
    this.syncControls();
  }

  private onStoreChange(): void {
    if (this.mode && !this.selectedContext() && !this.busy) {
      this.cancelMode();
      return;
    }
    this.syncControls();
    if (this.mode) this.renderHud();
  }

  private syncControls(): void {
    const reason = this.eligibilityReason();
    const disabled = Boolean(reason) || this.busy;
    [
      [this.addButton, 'add'],
      [this.subtractButton, 'subtract'],
    ].forEach(([source, operation]) => {
      const button = source as HTMLButtonElement | null;
      if (!button) return;
      button.disabled = disabled && this.mode !== operation;
      button.title = reason || (operation === 'add'
        ? 'Drag a rectangle to union it with the selected Piece'
        : 'Drag a rectangle to remove it from the selected Piece');
      const active = this.mode === operation;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  private eventCanvasPoint(
    event: PointerEvent,
    projection: PieceCanvasProjection,
  ): Point | null {
    const svg = this.svg;
    if (!svg) return null;
    return clientPointToViewportPoint(
      { x: event.clientX, y: event.clientY },
      svg.getBoundingClientRect(),
      {
        x: 0,
        y: 0,
        w: projection.canvas.width,
        h: projection.canvas.height,
      },
    );
  }

  private intercept(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.mode || this.busy || event.button !== 0) return;
    const context = this.selectedContext();
    if (!context) return;
    const canvas = this.eventCanvasPoint(event, context.projection);
    if (!canvas) return;

    this.intercept(event);
    const local = pieceShapeLocalPoint(context.item, canvas);
    this.drag = {
      pointerId: event.pointerId,
      layoutId: context.projection.layoutId ?? '',
      pieceId: context.item.id,
      start: local,
      current: local,
    };
    this.svg?.setPointerCapture?.(event.pointerId);
    this.renderPreview();
  }

  private onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!this.mode || !drag || drag.pointerId !== event.pointerId) return;
    const context = this.selectedContext();
    if (!context || context.item.id !== drag.pieceId) return;
    const canvas = this.eventCanvasPoint(event, context.projection);
    if (!canvas) return;

    this.intercept(event);
    drag.current = pieceShapeLocalPoint(context.item, canvas);
    this.renderPreview();
  }

  private onPointerUp(event: PointerEvent): void {
    const drag = this.drag;
    const operation = this.mode;
    if (!operation || !drag || drag.pointerId !== event.pointerId) return;
    const context = this.selectedContext();
    if (!context || context.item.id !== drag.pieceId) {
      this.cancelDrag(event.pointerId);
      return;
    }
    const canvas = this.eventCanvasPoint(event, context.projection);
    if (canvas) drag.current = pieceShapeLocalPoint(context.item, canvas);

    this.intercept(event);
    const rectangle = pieceShapeRectangleFromDrag(drag.start, drag.current);
    const state = this.store.getState();
    const layout = state.project.layouts.find((candidate) => candidate.id === drag.layoutId);
    this.cancelDrag(event.pointerId);
    if (!layout) return;

    this.busy = true;
    this.status = 'Updating Piece shape…';
    this.syncControls();
    this.renderHud();

    void preparePieceRectangleShapeEdit(
      layout,
      drag.pieceId,
      rectangle,
      operation,
    ).then((result) => {
      this.busy = false;
      if (!this.mode) return;
      if (!result.ok) {
        this.status = result.reason;
        this.syncControls();
        this.renderHud();
        return;
      }
      const eventResult = this.commands.execute(
        applyPreparedPieceShapeEdit(result.prepared),
      );
      this.status = eventResult
        ? (operation === 'add' ? 'Shape added.' : 'Shape subtracted.')
        : 'The Piece changed before the shape edit could be applied. Try again.';
      this.syncControls();
      this.renderHud();
    }).catch((error: unknown) => {
      this.busy = false;
      this.status = error instanceof Error
        ? error.message
        : 'Unable to update the Piece shape.';
      this.syncControls();
      this.renderHud();
    });
  }

  private onPointerCancel(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.intercept(event);
    this.cancelDrag(event.pointerId);
  }

  private cancelDrag(pointerId: number): void {
    this.drag = null;
    this.removePreview();
    try {
      this.svg?.releasePointerCapture?.(pointerId);
    } catch {
      // The browser may already have released pointer capture.
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.mode || event.key !== 'Escape') return;
    this.intercept(event);
    this.cancelMode();
  }

  private renderPreview(): void {
    this.removePreview();
    const drag = this.drag;
    if (!drag || !this.mode || !this.svg) return;
    const context = this.selectedContext();
    if (!context || context.item.id !== drag.pieceId) return;

    const rectangle = pieceShapeRectangleFromDrag(drag.start, drag.current);
    const corners = [
      { x: rectangle.x, y: rectangle.y },
      { x: rectangle.x + rectangle.w, y: rectangle.y },
      { x: rectangle.x + rectangle.w, y: rectangle.y + rectangle.h },
      { x: rectangle.x, y: rectangle.y + rectangle.h },
    ].map((point) => pieceShapeCanvasPoint(context.item, point));

    const polygon = this.svg.ownerDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'polygon',
    );
    polygon.dataset.pieceShapePreview = this.mode;
    polygon.setAttribute(
      'points',
      corners.map((point) => `${point.x},${point.y}`).join(' '),
    );
    polygon.setAttribute('vector-effect', 'non-scaling-stroke');
    polygon.setAttribute('stroke-width', '2');
    polygon.setAttribute('stroke-dasharray', '6 4');
    polygon.setAttribute('pointer-events', 'none');
    if (this.mode === 'add') {
      polygon.setAttribute('fill', 'rgb(22 163 74 / 16%)');
      polygon.setAttribute('stroke', '#16a34a');
    } else {
      polygon.setAttribute('fill', 'rgb(220 38 38 / 16%)');
      polygon.setAttribute('stroke', '#dc2626');
    }
    this.svg.append(polygon);
  }

  private removePreview(): void {
    this.svg?.querySelector('[data-piece-shape-preview]')?.remove();
  }

  private renderHud(): void {
    const mode = this.mode;
    const mount = this.root.querySelector<HTMLElement>('#lc-hud-root');
    if (!mode || !mount) {
      this.removeHud();
      return;
    }

    let hud = mount.querySelector<HTMLElement>('[data-piece-shape-hud]');
    if (!hud) {
      const document = mount.ownerDocument;
      hud = document.createElement('section');
      hud.className = 'lc-production-mode-hud';
      hud.dataset.pieceShapeHud = '1';

      const header = document.createElement('div');
      header.className = 'lc-production-mode-hud__header';
      const identity = document.createElement('div');
      identity.className = 'lc-production-mode-hud__identity';
      const title = document.createElement('strong');
      title.dataset.pieceShapeHudTitle = '1';
      identity.append(title);
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'lc-production-mode-hud__icon-btn';
      close.title = 'Exit shape editing';
      close.setAttribute('aria-label', 'Exit shape editing');
      close.textContent = '×';
      close.addEventListener('click', () => this.cancelMode());
      header.append(identity, close);

      const help = document.createElement('div');
      help.className = 'lc-production-mode-hud__help';
      help.dataset.pieceShapeHudHelp = '1';
      hud.append(header, help);
      mount.append(hud);
    }

    const title = hud.querySelector<HTMLElement>('[data-piece-shape-hud-title]');
    const help = hud.querySelector<HTMLElement>('[data-piece-shape-hud-help]');
    if (title) title.textContent = mode === 'add' ? 'ADD SHAPE' : 'SUBTRACT SHAPE';
    if (help) {
      const instruction = mode === 'add'
        ? 'Drag a rectangle that touches or overlaps the selected Piece.'
        : 'Drag from the perimeter inward to notch the selected Piece.';
      help.textContent = this.status ? `${instruction} · ${this.status}` : instruction;
      help.title = help.textContent;
    }
  }

  private removeHud(): void {
    this.root.querySelector('[data-piece-shape-hud]')?.remove();
  }
}
