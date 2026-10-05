import type { ApplicationEffects, AppStore } from '../app';
import { createFloorPlanCanvasProjection } from './floor-plan-canvas-model';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface FloorPlanCanvasSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  effects: ApplicationEffects;
}

export class FloorPlanCanvasSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly effects: ApplicationEffects;
  private svg: SVGSVGElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private observer: MutationObserver | null = null;
  private decorating = false;

  constructor(options: FloorPlanCanvasSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.effects = options.effects;
  }

  mount(): void {
    if (this.svg) return;
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    if (!this.svg) return;
    this.unsubscribe = this.effects.invalidation.subscribe((batch) => {
      if (batch.targets.includes('canvas')) this.decorate();
    });
    this.observer = new MutationObserver(() => this.decorate());
    this.observeCanvas();
    this.decorate();
  }

  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.observer?.disconnect();
    this.observer = null;
    this.svg?.querySelector('[data-plan-underlay="1"]')?.remove();
    this.svg = null;
  }

  decorate(): void {
    const svg = this.svg;
    if (!svg || this.decorating) return;

    // The underlay lives inside the SVG that this surface observes. Pause the
    // observer while replacing our own decoration so that our childList
    // mutations cannot recursively schedule another decoration forever.
    this.observer?.disconnect();
    this.decorating = true;
    try {
      svg.querySelector('[data-plan-underlay="1"]')?.remove();
      const projection = createFloorPlanCanvasProjection(this.store.getState());
      if (!projection) return;

      const { plan } = projection;
      const document = svg.ownerDocument;
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('data-plan-underlay', '1');
      group.setAttribute('class', 'lc-floor-plan-underlay');
      group.setAttribute('pointer-events', 'none');

      const sx = plan.flipX ? -1 : 1;
      const sy = plan.flipY ? -1 : 1;
      if (plan.rotation !== 0 || sx < 0 || sy < 0) {
        group.setAttribute(
          'transform',
          `translate(${projection.centerX} ${projection.centerY}) ` +
            `rotate(${plan.rotation}) scale(${sx} ${sy}) ` +
            `translate(${-projection.centerX} ${-projection.centerY})`,
        );
      }

      const image = document.createElementNS(SVG_NS, 'image');
      image.setAttribute('x', String(projection.x));
      image.setAttribute('y', String(projection.y));
      image.setAttribute('width', String(plan.w));
      image.setAttribute('height', String(plan.h));
      image.setAttribute('preserveAspectRatio', 'none');
      image.setAttribute('opacity', String(plan.opacity));
      image.setAttribute('href', plan.dataURL);
      if (plan.grayscale) image.style.filter = 'grayscale(1)';
      group.appendChild(image);

      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = plan.name;
      group.appendChild(title);

      const background = svg.querySelector('.lc-canvas-background');
      if (background?.nextSibling) {
        svg.insertBefore(group, background.nextSibling);
      } else if (background) {
        background.after(group);
      } else {
        svg.prepend(group);
      }
    } finally {
      this.decorating = false;
      this.observeCanvas();
    }
  }

  private observeCanvas(): void {
    if (!this.svg || !this.observer) return;
    this.observer.observe(this.svg, { childList: true });
  }
}
