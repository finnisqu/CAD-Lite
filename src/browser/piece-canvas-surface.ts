import {
  setWorkspace,
  type ApplicationEffects,
  type AppStore,
  type CommandDispatcher,
  type ViewInvalidationBatch,
} from '../app';
import {
  createPieceCanvasProjection,
  type PieceCanvasProjection,
} from './piece-canvas-model';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface PieceCanvasSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  effects: ApplicationEffects;
}

export class PieceCanvasSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly effects: ApplicationEffects;

  private abort: AbortController | null = null;
  private subscriptions: Array<() => void> = [];
  private svg: SVGSVGElement | null = null;
  private meta: HTMLElement | null = null;
  private designButton: HTMLButtonElement | null = null;
  private slabButton: HTMLButtonElement | null = null;

  constructor(options: PieceCanvasSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.effects = options.effects;
  }

  mount(): void {
    if (this.abort) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    this.meta = this.root.querySelector<HTMLElement>('#lc-canvas-meta');
    this.designButton =
      this.root.querySelector<HTMLButtonElement>('#lc-workspace-design');
    this.slabButton =
      this.root.querySelector<HTMLButtonElement>('#lc-workspace-slab');

    this.designButton?.addEventListener(
      'click',
      () => this.commands.execute(setWorkspace('design')),
      { signal },
    );
    this.slabButton?.addEventListener(
      'click',
      () => this.commands.execute(setWorkspace('slab')),
      { signal },
    );

    this.subscriptions.push(
      this.effects.invalidation.subscribe((batch) =>
        this.renderInvalidation(batch),
      ),
    );

    this.render();
  }

  unmount(): void {
    this.abort?.abort();
    this.abort = null;
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions = [];
  }

  render(): void {
    const projection = createPieceCanvasProjection(this.store.getState());
    this.renderWorkspaceControls(projection);
    this.renderSvg(projection);
  }

  private renderInvalidation(batch: ViewInvalidationBatch): void {
    if (batch.targets.includes('canvas')) this.render();
  }

  private renderWorkspaceControls(projection: PieceCanvasProjection): void {
    const design = projection.workspace === 'design';
    this.designButton?.classList.toggle('is-active', design);
    this.slabButton?.classList.toggle('is-active', !design);
    this.designButton?.setAttribute('aria-pressed', String(design));
    this.slabButton?.setAttribute('aria-pressed', String(!design));

    if (!this.meta) return;
    if (!projection.layoutId) {
      this.meta.textContent = 'No active Layout';
      return;
    }

    const label = design ? 'DESIGN' : 'SLAB';
    this.meta.textContent =
      label +
      ' · ' +
      String(projection.canvas.width) +
      '" × ' +
      String(projection.canvas.height) +
      '" · ' +
      String(projection.pieces.length) +
      ' Piece' +
      (projection.pieces.length === 1 ? '' : 's') +
      ' · ' +
      String(projection.scale) +
      ' px/in';
  }

  private renderSvg(projection: PieceCanvasProjection): void {
    const svg = this.svg;
    if (!svg) return;

    const scale = Math.max(0.001, Math.abs(projection.scale || 1));
    const width = Math.max(0, projection.canvas.width);
    const height = Math.max(0, projection.canvas.height);

    svg.replaceChildren();
    svg.dataset.workspace = projection.workspace;
    svg.setAttribute('width', String(Math.max(1, width * scale)));
    svg.setAttribute('height', String(Math.max(1, height * scale)));
    svg.setAttribute('viewBox', '0 0 ' + String(width) + ' ' + String(height));

    if (!projection.layoutId) return;

    const document = svg.ownerDocument;
    const background = document.createElementNS(SVG_NS, 'rect');
    background.setAttribute('class', 'lc-canvas-background');
    background.setAttribute('x', '0');
    background.setAttribute('y', '0');
    background.setAttribute('width', String(width));
    background.setAttribute('height', String(height));
    background.setAttribute('fill', '#ffffff');
    background.setAttribute('stroke', '#e5e7eb');
    background.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(background);

    projection.pieces.forEach((piece) => {
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', 'lc-piece-render');
      group.setAttribute('data-piece-id', piece.id);
      group.setAttribute('data-piece-layer', String(piece.layer));
      group.setAttribute('pointer-events', 'none');

      if (piece.renderRotation !== 0) {
        group.setAttribute(
          'transform',
          'rotate(' +
            String(piece.renderRotation) +
            ', ' +
            String(piece.center.x) +
            ', ' +
            String(piece.center.y) +
            ')',
        );
      }

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'lc-piece-shape');
      path.setAttribute('d', piece.path);
      path.setAttribute('fill', piece.appearance.fill);
      path.setAttribute('stroke', piece.appearance.stroke);
      path.setAttribute('stroke-width', '1');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      if (piece.appearance.fillOpacity !== null) {
        path.setAttribute(
          'fill-opacity',
          String(piece.appearance.fillOpacity),
        );
      }

      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = piece.name;
      group.append(path, title);
      svg.appendChild(group);
    });
  }
}
