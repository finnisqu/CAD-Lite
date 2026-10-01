import {
  calibrateFloorPlanDistance,
  calibrateFloorPlanSquare,
  type ApplicationEffects,
  type AppStore,
  type CommandDispatcher,
} from '../app';
import {
  createFloorPlanButton,
  createFloorPlanModal,
  type FloorPlanModal,
} from './floor-plan-modal';

const SVG_NS = 'http://www.w3.org/2000/svg';

type Point = { x: number; y: number };
type Square = { x: number; y: number; size: number };

interface DistanceCalibration {
  mode: 'distance';
  layoutId: string;
  first: Point | null;
  hover: Point | null;
}

interface SquareDrag {
  kind: 'create' | 'move' | 'resize';
  start: Point;
  original: Square | null;
  anchor: Point | null;
  signX: number;
  signY: number;
}

interface SquareCalibration {
  mode: 'square24';
  layoutId: string;
  square: Square | null;
  drag: SquareDrag | null;
}

type CalibrationState = DistanceCalibration | SquareCalibration | null;

export interface FloorPlanCalibrationSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  effects: ApplicationEffects;
  alert?: (message: string) => void;
  onModal?: (modal: FloorPlanModal | null) => void;
}

function ownerDocument(root: ParentNode): Document {
  if (root instanceof Document) return root;
  const document = (root as Node).ownerDocument;
  if (!document) throw new Error('Floor Plan calibration requires a Document.');
  return document;
}

export class FloorPlanCalibrationSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly effects: ApplicationEffects;
  private readonly alert: (message: string) => void;
  private readonly onModal: ((modal: FloorPlanModal | null) => void) | null;
  private readonly document: Document;

  private svg: SVGSVGElement | null = null;
  private abort: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private calibration: CalibrationState = null;
  private controls: HTMLElement | null = null;

  constructor(options: FloorPlanCalibrationSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.effects = options.effects;
    this.alert =
      options.alert ??
      ((message) => {
        if (typeof window !== 'undefined') window.alert(message);
      });
    this.onModal = options.onModal ?? null;
    this.document = ownerDocument(options.root);
  }

  mount(): void {
    if (this.abort) return;
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    if (!this.svg) return;
    this.abort = new AbortController();
    const signal = this.abort.signal;

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
      (event) => this.onPointerUp(event),
      { signal, capture: true },
    );

    this.unsubscribe = this.effects.invalidation.subscribe((batch) => {
      if (
        batch.targets.includes('canvas') ||
        batch.targets.includes('navigator')
      ) {
        queueMicrotask(() => this.decorate());
      }
    });
  }

  unmount(): void {
    this.cancel();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.abort?.abort();
    this.abort = null;
    this.svg = null;
  }

  startDistance(): void {
    const layoutId = this.unlockedPlanLayoutId();
    if (!layoutId) return;
    this.cancel();
    this.calibration = {
      mode: 'distance',
      layoutId,
      first: null,
      hover: null,
    };
    this.decorate();
  }

  startSquare24(): void {
    const layoutId = this.unlockedPlanLayoutId();
    if (!layoutId) return;
    this.cancel();
    this.calibration = {
      mode: 'square24',
      layoutId,
      square: null,
      drag: null,
    };
    this.decorate();
  }

  cancel(): void {
    this.calibration = null;
    this.svg?.querySelector('[data-plan-calibration="1"]')?.remove();
    this.controls?.remove();
    this.controls = null;
  }

  private unlockedPlanLayoutId(): string | null {
    const state = this.store.getState();
    if (state.session.workspace !== 'design') return null;
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    if (!layout?.plan) return null;
    if (layout.plan.locked) {
      this.alert('Unlock the floor plan before calibrating it.');
      return null;
    }
    return layout.id;
  }

  private point(event: PointerEvent): Point | null {
    const svg = this.svg;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * viewBox.width + viewBox.x,
      y: ((event.clientY - rect.top) / rect.height) * viewBox.height + viewBox.y,
    };
  }

  private own(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  private onPointerDown(event: PointerEvent): void {
    const calibration = this.calibration;
    const point = this.point(event);
    if (!calibration || !point || event.button !== 0) return;
    this.own(event);

    if (calibration.mode === 'distance') {
      if (!calibration.first) {
        calibration.first = point;
        calibration.hover = point;
        this.decorate();
        return;
      }
      const measured = Math.hypot(
        point.x - calibration.first.x,
        point.y - calibration.first.y,
      );
      if (measured > 0.0001) {
        this.requestKnownDistance(calibration.layoutId, measured);
      }
      return;
    }

    const square = calibration.square;
    if (!square) {
      calibration.square = { x: point.x, y: point.y, size: 0.125 };
      calibration.drag = {
        kind: 'create',
        start: point,
        original: null,
        anchor: point,
        signX: 1,
        signY: 1,
      };
    } else {
      const tolerance = Math.max(0.25, 10 / this.activeScale());
      const corners = [
        {
          point: { x: square.x, y: square.y },
          anchor: { x: square.x + square.size, y: square.y + square.size },
          signX: -1,
          signY: -1,
        },
        {
          point: { x: square.x + square.size, y: square.y },
          anchor: { x: square.x, y: square.y + square.size },
          signX: 1,
          signY: -1,
        },
        {
          point: {
            x: square.x + square.size,
            y: square.y + square.size,
          },
          anchor: { x: square.x, y: square.y },
          signX: 1,
          signY: 1,
        },
        {
          point: { x: square.x, y: square.y + square.size },
          anchor: { x: square.x + square.size, y: square.y },
          signX: -1,
          signY: 1,
        },
      ];
      const corner = corners.find(
        (candidate) =>
          Math.hypot(
            point.x - candidate.point.x,
            point.y - candidate.point.y,
          ) <= tolerance,
      );
      const inside =
        point.x >= square.x &&
        point.x <= square.x + square.size &&
        point.y >= square.y &&
        point.y <= square.y + square.size;
      if (corner) {
        calibration.drag = {
          kind: 'resize',
          start: point,
          original: { ...square },
          anchor: corner.anchor,
          signX: corner.signX,
          signY: corner.signY,
        };
      } else if (inside) {
        calibration.drag = {
          kind: 'move',
          start: point,
          original: { ...square },
          anchor: null,
          signX: 1,
          signY: 1,
        };
      } else {
        calibration.square = { x: point.x, y: point.y, size: 0.125 };
        calibration.drag = {
          kind: 'create',
          start: point,
          original: null,
          anchor: point,
          signX: 1,
          signY: 1,
        };
      }
    }
    this.svg?.setPointerCapture?.(event.pointerId);
    this.decorate();
  }

  private onPointerMove(event: PointerEvent): void {
    const calibration = this.calibration;
    const point = this.point(event);
    if (!calibration || !point) return;

    if (calibration.mode === 'distance') {
      if (!calibration.first) return;
      this.own(event);
      calibration.hover = point;
      this.decorate();
      return;
    }

    const drag = calibration.drag;
    if (!drag) return;
    this.own(event);
    if (drag.kind === 'move' && drag.original) {
      calibration.square = {
        ...drag.original,
        x: drag.original.x + point.x - drag.start.x,
        y: drag.original.y + point.y - drag.start.y,
      };
    } else if (drag.anchor) {
      const size = Math.max(
        0.125,
        Math.max(
          Math.abs(point.x - drag.anchor.x),
          Math.abs(point.y - drag.anchor.y),
        ),
      );
      calibration.square = {
        x: drag.signX > 0 ? drag.anchor.x : drag.anchor.x - size,
        y: drag.signY > 0 ? drag.anchor.y : drag.anchor.y - size,
        size,
      };
    }
    this.decorate();
  }

  private onPointerUp(event: PointerEvent): void {
    const calibration = this.calibration;
    if (!calibration || calibration.mode !== 'square24' || !calibration.drag) {
      return;
    }
    this.own(event);
    calibration.drag = null;
    try {
      this.svg?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
    this.decorate();
  }

  private activeScale(): number {
    const state = this.store.getState();
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    return Math.max(0.001, Math.abs(layout?.scale ?? 1));
  }

  private requestKnownDistance(layoutId: string, measured: number): void {
    const modal = createFloorPlanModal(
      this.document,
      'Calibrate Floor Plan',
      'lc-plan-calibrate-dialog',
      () => this.onModal?.(null),
    );
    this.onModal?.(modal);

    const help = this.document.createElement('p');
    help.className = 'lc-plan-help';
    help.textContent =
      'Enter the real-world distance between the two selected points. Scaling is uniform.';
    const input = this.document.createElement('input');
    input.type = 'number';
    input.className = 'lc-input';
    input.min = '0.001';
    input.step = '0.001';
    input.value = '24';
    const measuredText = this.document.createElement('div');
    measuredText.className = 'lc-small lc-plan-muted';
    measuredText.textContent = `Measured on canvas: ${measured.toFixed(3)} in`;
    modal.body.append(help, input, measuredText);

    modal.foot.append(
      createFloorPlanButton(this.document, 'Cancel', () => modal.close()),
      createFloorPlanButton(
        this.document,
        'Calibrate',
        () => {
          const known = Number(input.value);
          if (!(known > 0)) return;
          this.commands.execute(
            calibrateFloorPlanDistance(layoutId, measured, known),
          );
          modal.close();
          this.cancel();
        },
        true,
      ),
    );
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
  }

  private confirmSquare(): void {
    const calibration = this.calibration;
    if (
      !calibration ||
      calibration.mode !== 'square24' ||
      !calibration.square ||
      calibration.square.size <= 0.125
    ) {
      return;
    }
    this.commands.execute(
      calibrateFloorPlanSquare(calibration.layoutId, calibration.square.size),
    );
    this.cancel();
  }

  private decorate(): void {
    const svg = this.svg;
    const calibration = this.calibration;
    svg?.querySelector('[data-plan-calibration="1"]')?.remove();
    this.controls?.remove();
    this.controls = null;
    if (!svg || !calibration) return;

    const state = this.store.getState();
    if (
      state.session.workspace !== 'design' ||
      state.session.activeLayoutId !== calibration.layoutId
    ) {
      this.cancel();
      return;
    }

    const group = this.document.createElementNS(SVG_NS, 'g');
    group.setAttribute('data-plan-calibration', '1');
    group.setAttribute('pointer-events', 'none');
    const unit = 1 / this.activeScale();

    if (calibration.mode === 'distance') {
      this.decorateDistance(group, calibration, unit);
    } else {
      this.decorateSquare(group, calibration, unit);
    }
    svg.appendChild(group);
    this.decorateControls(svg, calibration);
  }

  private decorateDistance(
    group: SVGGElement,
    calibration: DistanceCalibration,
    unit: number,
  ): void {
    if (calibration.first && calibration.hover) {
      const line = this.document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(calibration.first.x));
      line.setAttribute('y1', String(calibration.first.y));
      line.setAttribute('x2', String(calibration.hover.x));
      line.setAttribute('y2', String(calibration.hover.y));
      line.setAttribute('stroke', '#2563eb');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '6 4');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      group.appendChild(line);
    }
    if (calibration.first) {
      const point = this.document.createElementNS(SVG_NS, 'circle');
      point.setAttribute('cx', String(calibration.first.x));
      point.setAttribute('cy', String(calibration.first.y));
      point.setAttribute('r', String(4 * unit));
      point.setAttribute('fill', '#2563eb');
      group.appendChild(point);
    }
  }

  private decorateSquare(
    group: SVGGElement,
    calibration: SquareCalibration,
    unit: number,
  ): void {
    const square = calibration.square;
    if (!square) return;
    const rect = this.document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(square.x));
    rect.setAttribute('y', String(square.y));
    rect.setAttribute('width', String(square.size));
    rect.setAttribute('height', String(square.size));
    rect.setAttribute('fill', 'rgba(37,99,235,.08)');
    rect.setAttribute('stroke', '#2563eb');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', '6 4');
    rect.setAttribute('vector-effect', 'non-scaling-stroke');
    group.appendChild(rect);

    const corners = [
      { x: square.x, y: square.y },
      { x: square.x + square.size, y: square.y },
      { x: square.x + square.size, y: square.y + square.size },
      { x: square.x, y: square.y + square.size },
    ];
    corners.forEach((corner) => {
      const handle = this.document.createElementNS(SVG_NS, 'circle');
      handle.setAttribute('cx', String(corner.x));
      handle.setAttribute('cy', String(corner.y));
      handle.setAttribute('r', String(4 * unit));
      handle.setAttribute('fill', '#ffffff');
      handle.setAttribute('stroke', '#2563eb');
      handle.setAttribute('stroke-width', '2');
      handle.setAttribute('vector-effect', 'non-scaling-stroke');
      group.appendChild(handle);
    });

    const label = this.document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(square.x + square.size / 2));
    label.setAttribute('y', String(square.y - 7 * unit));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', String(12 * unit));
    label.setAttribute('font-weight', '700');
    label.setAttribute('fill', '#1d4ed8');
    label.textContent = '24″ × 24″ calibration square';
    group.appendChild(label);
  }

  private decorateControls(
    svg: SVGSVGElement,
    calibration: Exclude<CalibrationState, null>,
  ): void {
    const controls = this.document.createElement('div');
    controls.className = 'lc-floor-plan-calibration-controls';
    const message = this.document.createElement('span');
    message.className = 'lc-small';

    if (calibration.mode === 'distance') {
      message.textContent = calibration.first
        ? 'Choose the second point for a known distance.'
        : 'Choose the first point of a known distance.';
      controls.append(
        message,
        createFloorPlanButton(this.document, 'Cancel', () => this.cancel()),
      );
    } else {
      message.textContent = calibration.square
        ? `Square side on canvas: ${calibration.square.size.toFixed(3)} in`
        : 'Drag a square over a known 24″ × 24″ feature.';
      const confirm = createFloorPlanButton(
        this.document,
        'Confirm 24″ Square',
        () => this.confirmSquare(),
        true,
      );
      confirm.disabled = !calibration.square || calibration.square.size <= 0.125;
      controls.append(
        message,
        confirm,
        createFloorPlanButton(this.document, 'Cancel', () => this.cancel()),
      );
    }

    svg.parentElement?.prepend(controls);
    this.controls = controls;
  }
}
