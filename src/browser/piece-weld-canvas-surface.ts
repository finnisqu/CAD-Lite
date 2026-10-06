import type {
  ApplicationEffects,
  AppStore,
  PieceInteractionController,
  ViewInvalidationBatch,
} from '../app';
import {
  pieceWeldWorldOutline,
  validPieceWelds,
  type PieceFabricationPoint,
} from '../domain/pieces';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface PieceWeldCanvasSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  effects: ApplicationEffects;
  interaction: PieceInteractionController;
}

function pathFromPoints(points: readonly PieceFabricationPoint[]): string {
  const first = points[0];
  if (!first || points.length < 3) return '';
  return [
    `M ${first.x} ${first.y}`,
    ...points.slice(1).map((point) => `L ${point.x} ${point.y}`),
    'Z',
  ].join(' ');
}

/**
 * Visual weld layer for the non-destructive source Piece model. Source Piece
 * groups remain in the DOM for hit testing/selection/children, but their normal
 * fill/stroke is hidden while one union perimeter is painted underneath them.
 */
export class PieceWeldCanvasSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly effects: ApplicationEffects;
  private readonly interaction: PieceInteractionController;
  private svg: SVGSVGElement | null = null;
  private observer: MutationObserver | null = null;
  private unsubscribe: (() => void) | null = null;
  private scheduled = false;

  constructor(options: PieceWeldCanvasSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.effects = options.effects;
    this.interaction = options.interaction;
  }

  mount(): void {
    if (this.observer || this.unsubscribe) return;
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    if (!this.svg) return;

    const Observer = this.svg.ownerDocument.defaultView?.MutationObserver;
    if (Observer) {
      this.observer = new Observer(() => this.scheduleRender());
      this.observer.observe(this.svg, { childList: true });
    }
    this.unsubscribe = this.effects.invalidation.subscribe((batch) =>
      this.renderInvalidation(batch),
    );
    this.scheduleRender();
  }

  unmount(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.scheduled = false;
    this.svg?.querySelector('[data-piece-weld-layer]')?.remove();
    this.svg = null;
  }

  private renderInvalidation(batch: ViewInvalidationBatch): void {
    if (batch.targets.includes('canvas')) this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.render();
    });
  }

  private render(): void {
    const svg = this.svg;
    if (!svg) return;
    const state = this.store.getState();
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    const existing = svg.querySelector<SVGGElement>('[data-piece-weld-layer]');

    if (!layout || state.session.workspace !== 'design') {
      existing?.remove();
      return;
    }

    const preview = this.interaction.getPreview();
    const previewById = new Map(
      (preview?.pieces ?? []).map((item) => [item.id, item]),
    );
    const welds = validPieceWelds(layout);
    const projected = welds.map((weld) => {
      const anchor = layout.pieces.find((piece) => piece.id === weld.anchorPieceId);
      const previewAnchor = previewById.get(weld.anchorPieceId);
      const outer = pieceWeldWorldOutline(
        layout,
        weld,
        previewAnchor?.pose,
      );
      return { weld, anchor, outer };
    }).filter((item) => item.anchor && item.outer.length >= 3);

    const signature = JSON.stringify(
      projected.map((item) => ({
        id: item.weld.id,
        outer: item.outer,
        color: item.anchor?.color,
        noFill: item.anchor?.noFill,
        opacity: item.anchor?.fillOpacity,
        showFill: state.preferences.showPieceFills,
      })),
    );
    const allHidden = projected.every((item) =>
      item.weld.memberIds.every((id) =>
        svg.querySelector(
          `[data-piece-id="${CSS.escape(id)}"] .lc-piece-shape[data-piece-weld-hidden="1"]`,
        ),
      ),
    );
    if (existing?.dataset.pieceWeldSignature === signature && allHidden) return;

    existing?.remove();
    if (!projected.length) return;

    const document = svg.ownerDocument;
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.setAttribute('class', 'lc-piece-weld-layer');
    layer.setAttribute('data-piece-weld-layer', '1');
    layer.setAttribute('pointer-events', 'none');
    layer.dataset.pieceWeldSignature = signature;

    projected.forEach(({ weld, anchor, outer }) => {
      if (!anchor) return;
      weld.memberIds.forEach((id) => {
        const shape = svg.querySelector<SVGPathElement>(
          `[data-piece-id="${CSS.escape(id)}"] .lc-piece-shape`,
        );
        if (!shape) return;
        shape.setAttribute('fill', 'none');
        shape.setAttribute('stroke', 'none');
        shape.dataset.pieceWeldHidden = '1';
      });

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'lc-piece-weld-shape');
      path.setAttribute('data-piece-weld-id', weld.id);
      path.setAttribute('d', pathFromPoints(outer));
      path.setAttribute(
        'fill',
        state.preferences.showPieceFills && !anchor.noFill
          ? anchor.color
          : 'none',
      );
      path.setAttribute('stroke', '#111111');
      path.setAttribute('stroke-width', '1');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      if (anchor.fillOpacity !== null) {
        path.setAttribute('fill-opacity', String(anchor.fillOpacity));
      }
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `Welded stone · ${weld.memberIds.length} source Pieces`;
      path.appendChild(title);
      layer.appendChild(path);
    });

    const firstPiece = svg.querySelector('.lc-piece-render');
    if (firstPiece) svg.insertBefore(layer, firstPiece);
    else svg.appendChild(layer);
  }
}
