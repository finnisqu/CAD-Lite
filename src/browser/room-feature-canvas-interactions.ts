import type {
  ApplicationEffects,
  AppStore,
  RoomFeatureInteractionController,
  RoomFeatureResizeSide,
  ToolController,
  ToolPointerInput,
} from '../app';
import { rotateVector } from '../geometry';
import {
  createAnnotationCanvasProjection,
  hitTestAnnotations,
} from './annotation-canvas-model';
import {
  createPieceCanvasProjection,
  hitTestPieceCanvas,
} from './piece-canvas-model';
import {
  createRoomFeatureCanvasProjection,
  hitTestRoomFeatures,
  type RoomFeatureCanvasItem,
} from './room-feature-canvas-model';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface RoomFeatureCanvasInteractionsOptions {
  root: ParentNode;
  store: AppStore;
  effects: ApplicationEffects;
  tools: ToolController;
  interaction: RoomFeatureInteractionController;
}

export class RoomFeatureCanvasInteractions {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly effects: ApplicationEffects;
  private readonly tools: ToolController;
  private readonly interaction: RoomFeatureInteractionController;
  private svg: SVGSVGElement | null = null;
  private abort: AbortController | null = null;
  private observer: MutationObserver | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(options: RoomFeatureCanvasInteractionsOptions) {
    this.root = options.root;
    this.store = options.store;
    this.effects = options.effects;
    this.tools = options.tools;
    this.interaction = options.interaction;
  }

  mount(): void {
    if (this.abort) return;
    const svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    if (!svg) return;
    this.svg = svg;
    this.abort = new AbortController();
    const signal = this.abort.signal;

    svg.addEventListener('pointerdown', (event) => this.onPointerDown(event), {
      signal,
      capture: true,
    });
    svg.addEventListener('pointermove', (event) => this.onPointerMove(event), {
      signal,
      capture: true,
    });
    svg.addEventListener('pointerup', (event) => this.onPointerUp(event), {
      signal,
      capture: true,
    });
    svg.addEventListener('pointercancel', (event) => this.onPointerCancel(event), {
      signal,
      capture: true,
    });

    this.unsubscribe = this.effects.invalidation.subscribe(() => this.decorate());
    this.observer = new MutationObserver(() => this.decorate());
    this.observe();
    this.decorate();
  }

  unmount(): void {
    this.interaction.cancel();
    this.abort?.abort();
    this.abort = null;
    this.observer?.disconnect();
    this.observer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.svg
      ?.querySelector('[data-room-feature-interaction-overlay]')
      ?.remove();
    this.svg = null;
  }

  private observe(): void {
    if (this.svg && this.observer) {
      this.observer.observe(this.svg, { childList: true });
    }
  }

  private eventInput(event: PointerEvent): ToolPointerInput | null {
    const svg = this.svg;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    if (rect.width <= 0 || rect.height <= 0) return null;

    return {
      pointerId: event.pointerId,
      x: ((event.clientX - rect.left) / rect.width) * viewBox.width + viewBox.x,
      y: ((event.clientY - rect.top) / rect.height) * viewBox.height + viewBox.y,
      button: event.button,
      buttons: event.buttons,
      modifiers: {
        shift: event.shiftKey,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
      },
    };
  }

  private ownPointer(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.tools.getActiveTool()) return;
    const input = this.eventInput(event);
    if (!input || input.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;

    const resize = target?.closest<SVGElement>(
      '[data-room-feature-resize-side][data-room-feature-id]',
    );
    const rotate = target?.closest<SVGElement>(
      '[data-room-feature-rotate-handle][data-room-feature-id]',
    );

    const resizeId = resize?.dataset.roomFeatureId;
    const resizeSide = resize?.dataset.roomFeatureResizeSide;
    if (
      resizeId &&
      (resizeSide === 'top' ||
        resizeSide === 'right' ||
        resizeSide === 'bottom' ||
        resizeSide === 'left') &&
      this.interaction.beginResize(
        resizeId,
        resizeSide as RoomFeatureResizeSide,
        input,
      )
    ) {
      this.ownPointer(event);
      this.svg?.setPointerCapture?.(event.pointerId);
      return;
    }

    const rotateId = rotate?.dataset.roomFeatureId;
    if (rotateId && this.interaction.beginRotate(rotateId, input)) {
      this.ownPointer(event);
      this.svg?.setPointerCapture?.(event.pointerId);
      return;
    }

    const state = this.store.getState();
    if (state.session.workspace !== 'design') return;
    const point = { x: input.x, y: input.y };
    const pieceProjection = createPieceCanvasProjection(state, []);
    if (hitTestPieceCanvas(pieceProjection, point)) return;
    const annotationProjection = createAnnotationCanvasProjection(state);
    if (hitTestAnnotations(annotationProjection, point, pieceProjection.scale)) {
      return;
    }

    const roomFeature = hitTestRoomFeatures(
      createRoomFeatureCanvasProjection(state),
      point,
    );
    if (!roomFeature || !this.interaction.beginMove(roomFeature.id, input)) return;

    this.ownPointer(event);
    this.svg?.setPointerCapture?.(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.interaction.hasActivePointer()) return;
    const input = this.eventInput(event);
    if (!input) return;
    this.ownPointer(event);
    this.interaction.pointerMove(input);
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.interaction.hasActivePointer()) return;
    const input = this.eventInput(event);
    if (!input) return;
    this.ownPointer(event);
    this.interaction.pointerUp({ ...input, buttons: 0 });
    try {
      this.svg?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    this.decorate();
  }

  private onPointerCancel(event: PointerEvent): void {
    if (!this.interaction.hasActivePointer()) return;
    this.ownPointer(event);
    this.interaction.cancel();
    try {
      this.svg?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    this.decorate();
  }

  private handlePoint(
    item: RoomFeatureCanvasItem,
    x: number,
    y: number,
  ): { x: number; y: number } {
    const offset = rotateVector(
      x - item.center.x,
      y - item.center.y,
      item.rotation,
    );
    return {
      x: item.center.x + offset.x,
      y: item.center.y + offset.y,
    };
  }

  private decorate(): void {
    const svg = this.svg;
    const observer = this.observer;
    if (!svg) return;

    observer?.disconnect();
    svg.querySelector('[data-room-feature-interaction-overlay]')?.remove();

    const state = this.store.getState();
    if (state.session.workspace !== 'design') {
      this.observe();
      return;
    }

    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    if (!layout) {
      this.observe();
      return;
    }

    const document = svg.ownerDocument;
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('data-room-feature-interaction-overlay', '1');
    group.setAttribute('class', 'lc-room-feature-interaction-overlay');
    const projection = createRoomFeatureCanvasProjection(state);
    const unit = 1 / Math.max(0.001, Math.abs(layout.scale || 1));

    const raw = state.session.interaction.preview;
    if (raw && !Array.isArray(raw) && typeof raw === 'object') {
      const record = raw as Record<string, unknown>;
      const guideX = typeof record.guideX === 'number' ? record.guideX : null;
      const guideY = typeof record.guideY === 'number' ? record.guideY : null;
      if (guideX !== null) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(guideX));
        line.setAttribute('x2', String(guideX));
        line.setAttribute('y1', '0');
        line.setAttribute('y2', String(pieceCanvasHeight(state)));
        line.setAttribute('stroke', '#2563eb');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '3 4');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        line.setAttribute('pointer-events', 'none');
        group.appendChild(line);
      }
      if (guideY !== null) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', '0');
        line.setAttribute('x2', String(pieceCanvasWidth(state)));
        line.setAttribute('y1', String(guideY));
        line.setAttribute('y2', String(guideY));
        line.setAttribute('stroke', '#2563eb');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '3 4');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        line.setAttribute('pointer-events', 'none');
        group.appendChild(line);
      }
    }

    const preview = projection.items.find((item) => item.preview);
    if (preview) {
      const outline = document.createElementNS(SVG_NS, 'path');
      outline.setAttribute('d', preview.path);
      outline.setAttribute('fill', 'none');
      outline.setAttribute('stroke', '#2563eb');
      outline.setAttribute('stroke-width', '1.5');
      outline.setAttribute('stroke-dasharray', '6 4');
      outline.setAttribute('vector-effect', 'non-scaling-stroke');
      outline.setAttribute('pointer-events', 'none');
      if (preview.rotation) {
        outline.setAttribute(
          'transform',
          'rotate(' +
            String(preview.rotation) +
            ' ' +
            String(preview.center.x) +
            ' ' +
            String(preview.center.y) +
            ')',
        );
      }
      group.appendChild(outline);
    }

    if (!this.tools.getActiveTool() && !this.interaction.hasActivePointer()) {
      const selected = projection.items.find((item) => item.selected && !item.preview);
      if (selected) this.renderHandles(document, group, selected, unit);
    }

    svg.appendChild(group);
    this.observe();
  }

  private renderHandles(
    document: Document,
    group: SVGGElement,
    item: RoomFeatureCanvasItem,
    unit: number,
  ): void {
    const local = {
      top: { x: item.center.x, y: item.y },
      right: { x: item.x + item.length, y: item.center.y },
      bottom: { x: item.center.x, y: item.y + item.depth },
      left: { x: item.x, y: item.center.y },
    } as const;

    (Object.keys(local) as RoomFeatureResizeSide[]).forEach((side) => {
      const source = local[side];
      const point = this.handlePoint(item, source.x, source.y);
      const handle = document.createElementNS(SVG_NS, 'circle');
      handle.setAttribute('cx', String(point.x));
      handle.setAttribute('cy', String(point.y));
      handle.setAttribute('r', String(5 * unit));
      handle.setAttribute('fill', '#ffffff');
      handle.setAttribute('stroke', '#2563eb');
      handle.setAttribute('stroke-width', '1.5');
      handle.setAttribute('vector-effect', 'non-scaling-stroke');
      handle.setAttribute('pointer-events', 'all');
      handle.setAttribute('data-room-feature-id', item.id);
      handle.setAttribute('data-room-feature-resize-side', side);
      handle.style.cursor = side === 'left' || side === 'right' ? 'ew-resize' : 'ns-resize';
      group.appendChild(handle);
    });

    const top = this.handlePoint(item, item.center.x, item.y);
    const rotatePoint = this.handlePoint(
      item,
      item.center.x,
      item.y - 22 * unit,
    );
    const stem = document.createElementNS(SVG_NS, 'line');
    stem.setAttribute('x1', String(top.x));
    stem.setAttribute('y1', String(top.y));
    stem.setAttribute('x2', String(rotatePoint.x));
    stem.setAttribute('y2', String(rotatePoint.y));
    stem.setAttribute('stroke', '#2563eb');
    stem.setAttribute('stroke-width', '1');
    stem.setAttribute('vector-effect', 'non-scaling-stroke');
    stem.setAttribute('pointer-events', 'none');
    group.appendChild(stem);

    const rotate = document.createElementNS(SVG_NS, 'circle');
    rotate.setAttribute('cx', String(rotatePoint.x));
    rotate.setAttribute('cy', String(rotatePoint.y));
    rotate.setAttribute('r', String(6 * unit));
    rotate.setAttribute('fill', '#ffffff');
    rotate.setAttribute('stroke', '#2563eb');
    rotate.setAttribute('stroke-width', '1.5');
    rotate.setAttribute('vector-effect', 'non-scaling-stroke');
    rotate.setAttribute('pointer-events', 'all');
    rotate.setAttribute('data-room-feature-id', item.id);
    rotate.setAttribute('data-room-feature-rotate-handle', '1');
    rotate.style.cursor = 'grab';
    group.appendChild(rotate);
  }
}

function pieceCanvasWidth(state: ReturnType<AppStore['getState']>): number {
  const layout = state.project.layouts.find(
    (item) => item.id === state.session.activeLayoutId,
  );
  return Math.max(0, Number(layout?.cw) || 0);
}

function pieceCanvasHeight(state: ReturnType<AppStore['getState']>): number {
  const layout = state.project.layouts.find(
    (item) => item.id === state.session.activeLayoutId,
  );
  return Math.max(0, Number(layout?.ch) || 0);
}
