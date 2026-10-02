import {
  createLinkedWallTargets,
  type AppStore,
  type LinkedWallBrushAction,
} from '../app';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ProductionLinkedWallTargetSurfaceOptions {
  root: ParentNode;
  store: AppStore;
}

function previewRecord(
  value: unknown,
): Record<string, unknown> | null {
  return value && !Array.isArray(value) && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export class ProductionLinkedWallTargetSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private svg: SVGSVGElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private observer: MutationObserver | null = null;
  private scheduled = false;
  private rendering = false;

  constructor(options: ProductionLinkedWallTargetSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
  }

  mount(): void {
    if (this.unsubscribe || this.observer) return;
    if (!this.root.querySelector('[data-cad-lite-production-shell]')) return;
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    if (!this.svg) return;

    this.unsubscribe = this.store.subscribe(() => this.scheduleRender());
    const Observer = this.svg.ownerDocument.defaultView?.MutationObserver;
    if (Observer) {
      this.observer = new Observer(() => this.scheduleRender());
      this.observer.observe(this.svg, { childList: true });
    }
    this.scheduleRender();
  }

  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.observer?.disconnect();
    this.observer = null;
    this.svg
      ?.querySelector('[data-production-linked-wall-target-layer]')
      ?.remove();
    this.svg = null;
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
    if (this.rendering) return;
    const svg = this.svg;
    if (!svg) return;
    this.rendering = true;
    try {
      const state = this.store.getState();
      const active = state.session.interaction.activeTool;
      const existing = svg.querySelector<SVGGElement>(
        '[data-production-linked-wall-target-layer]',
      );
      if (
        state.session.workspace !== 'design' ||
        active?.id !== 'linkedWall'
      ) {
        existing?.remove();
        return;
      }

      const thicknessRaw = Number(active.options.thickness);
      const thickness = Number.isFinite(thicknessRaw)
        ? Math.max(0.25, Math.min(24, thicknessRaw))
        : 4.5;
      const action: LinkedWallBrushAction =
        active.options.brush === 'erase' ? 'erase' : 'add';
      const targets = createLinkedWallTargets(state, thickness);
      const preview = previewRecord(state.session.interaction.preview);
      const hoverGroupKey =
        preview?.kind === 'linked-wall-target' &&
        typeof preview.groupKey === 'string'
          ? preview.groupKey
          : null;
      const hoverEdge =
        preview?.kind === 'linked-wall-target' &&
        typeof preview.edge === 'string'
          ? preview.edge
          : null;
      const signature = JSON.stringify({
        action,
        thickness,
        hoverGroupKey,
        hoverEdge,
        targets: targets.map((target) => [
          target.groupKey,
          target.edge,
          target.p1.x,
          target.p1.y,
          target.p2.x,
          target.p2.y,
          target.occupiedWallId,
        ]),
      });
      if (existing?.dataset.signature === signature) return;
      existing?.remove();

      const document = svg.ownerDocument;
      const layer = document.createElementNS(SVG_NS, 'g');
      layer.dataset.productionLinkedWallTargetLayer = '1';
      layer.dataset.signature = signature;
      layer.setAttribute('class', 'lc-production-linked-wall-target-layer');
      layer.setAttribute('pointer-events', 'none');

      targets.forEach((target) => {
        const line = document.createElementNS(SVG_NS, 'line');
        const hovered =
          target.groupKey === hoverGroupKey && target.edge === hoverEdge;
        line.setAttribute(
          'class',
          'lc-production-linked-wall-target' +
            (target.occupiedWallId ? ' is-occupied' : '') +
            (action === 'erase' ? ' is-erasing' : '') +
            (hovered ? ' is-hovered' : ''),
        );
        line.setAttribute('x1', String(target.p1.x));
        line.setAttribute('y1', String(target.p1.y));
        line.setAttribute('x2', String(target.p2.x));
        line.setAttribute('y2', String(target.p2.y));
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        const title = document.createElementNS(SVG_NS, 'title');
        title.textContent =
          action === 'erase'
            ? target.occupiedWallId
              ? 'Remove linked wall'
              : 'No linked wall on this edge'
            : target.occupiedWallId
              ? 'Linked wall already exists'
              : 'Add linked wall';
        line.append(title);
        layer.append(line);
      });

      svg.append(layer);
    } finally {
      this.rendering = false;
    }
  }
}
