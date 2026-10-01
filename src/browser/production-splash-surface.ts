import {
  createSplashEdgeTargets,
  splashToolOptions,
  type AppStore,
  type SplashBrushAction,
  type ToolController,
} from '../app';
import {
  isBacksplashPiece,
  linkedSplashForEdge,
  linkedSplashPlacement,
  pieceRotatedCornersFromGeometryPose,
  type PieceSide,
} from '../domain/pieces';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIDES: readonly PieceSide[] = ['top', 'right', 'bottom', 'left'];
const SPLASH_HELP =
  'Click a countertop edge to add or subtract a linked splash. Scope controls whether the brush targets the selected piece or all pieces. Hold S for momentary mode; Shift+S locks it. Enter or Escape exits.';

export interface ProductionSplashSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  tools: ToolController;
}

interface SelectedSplashParentProjection {
  pieceId: string;
  name: string;
  occupiedEdges: PieceSide[];
  active: boolean;
}

export function createSelectedSplashParentProjection(
  state: ReturnType<AppStore['getState']>,
): SelectedSplashParentProjection | null {
  if (state.session.workspace !== 'design') return null;
  const selection = state.session.selection;
  if (selection.kind !== 'pieces' || selection.ids.length !== 1) return null;
  const layout = state.project.layouts.find(
    (item) => item.id === state.session.activeLayoutId,
  );
  const piece = layout?.pieces.find((item) => item.id === selection.ids[0]);
  if (!layout || !piece || isBacksplashPiece(piece)) return null;
  return {
    pieceId: piece.id,
    name: piece.name,
    occupiedEdges: SIDES.filter(
      (edge) => linkedSplashForEdge(layout.pieces, piece.id, edge) !== null,
    ),
    active: state.session.interaction.activeTool?.id === 'splash',
  };
}

function button(
  document: Document,
  text: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = className;
  control.textContent = text;
  control.addEventListener('click', onClick);
  return control;
}

function numberField(
  document: Document,
  labelText: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onInput: (value: number) => void,
): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'lc-production-splash-hud__field';
  const span = document.createElement('span');
  span.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const commit = (): void => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onInput(next);
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      input.blur();
    }
  });
  label.append(span, input);
  return label;
}

export class ProductionSplashSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly tools: ToolController;
  private inspector: HTMLElement | null = null;
  private hudRoot: HTMLElement | null = null;
  private svg: SVGSVGElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private inspectorObserver: MutationObserver | null = null;
  private svgObserver: MutationObserver | null = null;
  private scheduled = false;
  private rendering = false;

  constructor(options: ProductionSplashSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.tools = options.tools;
  }

  mount(): void {
    if (this.unsubscribe || this.inspectorObserver || this.svgObserver) return;
    if (!this.root.querySelector('[data-cad-lite-production-shell]')) return;
    this.inspector = this.root.querySelector<HTMLElement>('#lc-inspector');
    this.hudRoot = this.root.querySelector<HTMLElement>('#lc-hud-root');
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    if (!this.inspector || !this.hudRoot || !this.svg) return;

    this.unsubscribe = this.store.subscribe(() => this.scheduleRender());
    const view = this.svg.ownerDocument.defaultView;
    const Observer = view?.MutationObserver;
    if (Observer) {
      this.inspectorObserver = new Observer(() => this.scheduleRender());
      this.inspectorObserver.observe(this.inspector, {
        childList: true,
        subtree: true,
      });
      this.svgObserver = new Observer(() => {
        const active = this.store.getState().session.interaction.activeTool?.id === 'splash';
        if (
          active &&
          !this.svg?.querySelector(':scope > [data-production-splash-targets]')
        ) {
          this.scheduleRender();
        }
      });
      this.svgObserver.observe(this.svg, { childList: true });
    }

    this.render();
  }

  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.inspectorObserver?.disconnect();
    this.inspectorObserver = null;
    this.svgObserver?.disconnect();
    this.svgObserver = null;
    this.inspector?.querySelector(':scope > [data-production-splash-section]')?.remove();
    this.hudRoot?.querySelector('[data-production-splash-hud]')?.remove();
    this.svg?.querySelector(':scope > [data-production-splash-targets]')?.remove();
    this.inspector = null;
    this.hudRoot = null;
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
    this.rendering = true;
    try {
      this.renderInspector();
      this.renderHud();
      this.renderTargets();
    } finally {
      this.rendering = false;
    }
  }

  private renderInspector(): void {
    const inspector = this.inspector;
    if (!inspector) return;
    const projection = createSelectedSplashParentProjection(this.store.getState());
    const signature = projection ? JSON.stringify(projection) : '';
    const existing = inspector.querySelector<HTMLElement>(
      ':scope > [data-production-splash-section]',
    );
    if (existing?.dataset.productionSplashSignature === signature) return;
    existing?.remove();
    if (!projection) return;

    const document = inspector.ownerDocument;
    const section = document.createElement('section');
    section.className = 'lc-production-piece-splashes';
    section.dataset.productionSplashSection = '1';
    section.dataset.productionSplashSignature = signature;

    const header = document.createElement('div');
    header.className = 'lc-production-piece-splashes__header';
    const strong = document.createElement('strong');
    strong.textContent = 'Splashes';
    const count = document.createElement('span');
    count.className = 'lc-production-piece-splashes__count';
    count.textContent = `${projection.occupiedEdges.length}/4`;
    header.append(strong, count);

    const body = document.createElement('div');
    body.className = 'lc-production-piece-splashes__body';
    const status = document.createElement('div');
    status.className = 'lc-production-piece-splashes__status';
    SIDES.forEach((edge) => {
      const chip = document.createElement('span');
      chip.className = projection.occupiedEdges.includes(edge)
        ? 'is-present'
        : '';
      chip.textContent = edge[0]?.toUpperCase() + edge.slice(1);
      status.append(chip);
    });

    const launch = button(
      document,
      projection.active ? 'Splash Tool: On' : '+ Add Splash',
      'lc-btn lc-production-piece-splashes__launch',
      () => {
        const active = this.tools.getActiveTool();
        if (active?.id === 'splash' && active.activation === 'momentary') {
          this.tools.promoteHeldToLocked();
        } else {
          this.tools.toggleLocked('splash');
        }
      },
    );
    launch.setAttribute('aria-pressed', String(projection.active));
    launch.title =
      'Use the Splash brush on countertop edges. Hold S for momentary mode; Shift+S locks or unlocks it.';

    body.append(status, launch);
    section.append(header, body);

    const anchor = inspector.querySelector(
      ':scope > .lc-piece-sinks-inspector, :scope > .lc-piece-cutouts-inspector, :scope > .lc-piece-seams-inspector, :scope > .lc-piece-mirror-actions',
    );
    inspector.insertBefore(section, anchor);
  }

  private renderHud(): void {
    const mount = this.hudRoot;
    if (!mount) return;
    const state = this.store.getState();
    const active = state.session.interaction.activeTool;
    const existing = mount.querySelector<HTMLElement>(
      '[data-production-splash-hud]',
    );
    if (!active || active.id !== 'splash') {
      existing?.remove();
      return;
    }

    const options = splashToolOptions(active);
    const selected = createSelectedSplashParentProjection(state);
    const signature = JSON.stringify({
      activation: active.activation,
      scope: active.scope,
      options,
      hud: state.session.interaction.hud,
      selectedPieceId: selected?.pieceId ?? null,
    });
    if (existing?.dataset.productionSplashSignature === signature) return;
    existing?.remove();

    const document = mount.ownerDocument;
    const hud = document.createElement('section');
    hud.className = 'lc-production-splash-hud';
    hud.dataset.productionSplashHud = '1';
    hud.dataset.productionSplashSignature = signature;
    if (state.session.interaction.hud.userMoved) {
      hud.classList.add('is-user-moved');
      if (state.session.interaction.hud.left !== null) {
        hud.style.left = `${state.session.interaction.hud.left}px`;
      }
      if (state.session.interaction.hud.top !== null) {
        hud.style.top = `${state.session.interaction.hud.top}px`;
      }
    }

    const header = document.createElement('div');
    header.className = 'lc-production-splash-hud__header';
    const title = document.createElement('strong');
    title.textContent = 'SPLASH';
    const headerActions = document.createElement('div');
    headerActions.className = 'lc-production-splash-hud__header-actions';
    const lock = button(
      document,
      active.activation === 'locked' ? 'Locked' : 'Lock',
      'lc-production-splash-hud__icon-btn',
      () => {
        if (active.activation === 'momentary') this.tools.promoteHeldToLocked();
        else this.tools.cancel();
      },
    );
    lock.title = active.activation === 'locked'
      ? 'Unlock and close Splash mode'
      : 'Lock this momentary Splash mode';
    const close = button(
      document,
      '×',
      'lc-production-splash-hud__icon-btn',
      () => this.tools.cancel(),
    );
    close.title = 'Close Splash mode';
    headerActions.append(lock, close);
    header.append(title, headerActions);

    const scope = document.createElement('div');
    scope.className = 'lc-production-splash-hud__row';
    const scopeLabel = document.createElement('span');
    scopeLabel.textContent = 'Scope';
    const scopeGroup = document.createElement('div');
    scopeGroup.className = 'lc-production-splash-hud__segmented';
    const selectedScope = button(
      document,
      'Selected Piece',
      active.scope === 'selected' ? 'is-active' : '',
      () => this.tools.setScope('selected'),
    );
    const allScope = button(
      document,
      'All Pieces',
      active.scope !== 'selected' ? 'is-active' : '',
      () => this.tools.setScope('all'),
    );
    scopeGroup.append(selectedScope, allScope);
    scope.append(scopeLabel, scopeGroup);

    const brush = document.createElement('div');
    brush.className = 'lc-production-splash-hud__row';
    const brushLabel = document.createElement('span');
    brushLabel.textContent = 'Brush';
    const brushGroup = document.createElement('div');
    brushGroup.className = 'lc-production-splash-hud__segmented';
    const setBrush = (action: SplashBrushAction): void => {
      this.tools.setToolOption('brush', action);
    };
    brushGroup.append(
      button(document, 'Add', options.brush === 'add' ? 'is-active' : '', () => setBrush('add')),
      button(document, 'Subtract', options.brush === 'erase' ? 'is-active is-danger' : '', () => setBrush('erase')),
    );
    brush.append(brushLabel, brushGroup);

    const measurements = document.createElement('div');
    measurements.className = 'lc-production-splash-hud__measurements';
    measurements.append(
      numberField(document, 'Height', options.height, 0.25, 24, 0.25, (value) => {
        this.tools.setToolOption('height', value);
      }),
      numberField(document, 'Offset', options.offset, 0, 1, 0.125, (value) => {
        this.tools.setToolOption('offset', value);
      }),
    );

    const help = document.createElement('div');
    help.className = 'lc-production-splash-hud__help';
    help.textContent = `HELP · ${SPLASH_HELP}`;
    help.title = SPLASH_HELP;

    if (active.scope === 'selected' && !selected) {
      const warning = document.createElement('div');
      warning.className = 'lc-production-splash-hud__warning';
      warning.textContent = 'Select one countertop piece to use Selected Piece scope.';
      hud.append(header, scope, brush, measurements, warning, help);
    } else {
      hud.append(header, scope, brush, measurements, help);
    }

    this.attachHudDrag(hud, header, mount);
    mount.append(hud);
  }

  private attachHudDrag(
    hud: HTMLElement,
    header: HTMLElement,
    mount: HTMLElement,
  ): void {
    let drag: {
      pointerId: number;
      startX: number;
      startY: number;
      left: number;
      top: number;
    } | null = null;

    header.addEventListener('pointerdown', (event) => {
      if (!(event instanceof PointerEvent) || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('button,input')) {
        return;
      }
      const hudRect = hud.getBoundingClientRect();
      const mountRect = mount.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: hudRect.left - mountRect.left,
        top: hudRect.top - mountRect.top,
      };
      header.setPointerCapture?.(event.pointerId);
      hud.classList.add('is-user-moved', 'is-dragging');
      hud.style.transform = 'none';
      event.preventDefault();
    });

    header.addEventListener('pointermove', (event) => {
      if (!(event instanceof PointerEvent) || !drag || event.pointerId !== drag.pointerId) {
        return;
      }
      const mountRect = mount.getBoundingClientRect();
      const hudRect = hud.getBoundingClientRect();
      const left = Math.max(
        0,
        Math.min(
          Math.max(0, mountRect.width - hudRect.width),
          drag.left + event.clientX - drag.startX,
        ),
      );
      const top = Math.max(
        0,
        Math.min(
          Math.max(0, mountRect.height - hudRect.height),
          drag.top + event.clientY - drag.startY,
        ),
      );
      hud.style.left = `${left}px`;
      hud.style.top = `${top}px`;
    });

    const finish = (event: PointerEvent): void => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const left = Number.parseFloat(hud.style.left || '0');
      const top = Number.parseFloat(hud.style.top || '0');
      drag = null;
      hud.classList.remove('is-dragging');
      this.tools.setHudPosition(left, top);
    };
    header.addEventListener('pointerup', finish);
    header.addEventListener('pointercancel', finish);
  }

  private renderTargets(): void {
    const svg = this.svg;
    if (!svg) return;
    svg.querySelector(':scope > [data-production-splash-targets]')?.remove();

    const state = this.store.getState();
    const active = state.session.interaction.activeTool;
    if (!active || active.id !== 'splash' || state.session.workspace !== 'design') {
      return;
    }
    const options = splashToolOptions(active);
    const targets = createSplashEdgeTargets(state, active);
    if (!targets.length) return;
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    if (!layout) return;

    const group = svg.ownerDocument.createElementNS(SVG_NS, 'g');
    group.dataset.productionSplashTargets = '1';
    group.setAttribute('class', `lc-production-splash-targets is-${options.brush}`);
    group.setAttribute('pointer-events', 'none');

    targets.forEach((target) => {
      if (options.brush === 'erase' && !target.occupied) return;
      const item = svg.ownerDocument.createElementNS(SVG_NS, 'g');
      item.setAttribute(
        'class',
        `lc-production-splash-target${target.occupied ? ' is-occupied' : ''}`,
      );
      item.dataset.pieceId = target.pieceId;
      item.dataset.edge = target.edge;

      if (options.brush === 'add' && !target.occupied) {
        const parent = layout.pieces.find((piece) => piece.id === target.pieceId);
        if (parent) {
          const placement = linkedSplashPlacement(
            parent,
            target.edge,
            options.height,
            options.offset,
          );
          const corners = pieceRotatedCornersFromGeometryPose(
            {
              kind: 'rectangle',
              width: placement.length,
              height: placement.height,
              cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 },
            },
            {
              x: placement.x,
              y: placement.y,
              rotation: placement.rotation,
            },
          );
          const preview = svg.ownerDocument.createElementNS(SVG_NS, 'polygon');
          preview.setAttribute(
            'points',
            corners.map((point) => `${point.x},${point.y}`).join(' '),
          );
          preview.setAttribute('class', 'lc-production-splash-target__preview');
          item.append(preview);
        }
      }

      const line = svg.ownerDocument.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(target.start.x));
      line.setAttribute('y1', String(target.start.y));
      line.setAttribute('x2', String(target.end.x));
      line.setAttribute('y2', String(target.end.y));
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      line.setAttribute('class', 'lc-production-splash-target__edge');
      item.append(line);
      group.append(item);
    });

    svg.append(group);
  }
}
