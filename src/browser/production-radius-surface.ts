import {
  createRadiusCornerTargets,
  radiusToolOptions,
  type AppStore,
  type RadiusBrushAction,
  type ToolController,
} from '../app';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const RADIUS_PLACEMENT_KEY = 'litecad:radiusLabelPlacement';
const RADIUS_HELP =
  'Click a rounded Piece or Sink corner to add or erase its radius label. Scope controls whether targets come from the selected piece or all pieces. Hold R for momentary mode; Shift+R locks it. Enter or Escape exits.';

export interface ProductionRadiusSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  tools: ToolController;
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

function savedPlacement(view: Window | null): 'inside' | 'outside' {
  try {
    return view?.localStorage.getItem(RADIUS_PLACEMENT_KEY) === 'inside'
      ? 'inside'
      : 'outside';
  } catch {
    return 'outside';
  }
}

export class ProductionRadiusSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly tools: ToolController;
  private hudRoot: HTMLElement | null = null;
  private svg: SVGSVGElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private svgObserver: MutationObserver | null = null;
  private scheduled = false;
  private rendering = false;

  constructor(options: ProductionRadiusSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.tools = options.tools;
  }

  mount(): void {
    if (this.unsubscribe || this.svgObserver) return;
    if (!this.root.querySelector('[data-cad-lite-production-shell]')) return;
    this.hudRoot = this.root.querySelector<HTMLElement>('#lc-hud-root');
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    if (!this.hudRoot || !this.svg) return;

    this.unsubscribe = this.store.subscribe(() => this.scheduleRender());
    const Observer = this.svg.ownerDocument.defaultView?.MutationObserver;
    if (Observer) {
      this.svgObserver = new Observer(() => {
        const active =
          this.store.getState().session.interaction.activeTool?.id === 'radius';
        if (
          active &&
          !this.svg?.querySelector(':scope > [data-production-radius-targets]')
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
    this.svgObserver?.disconnect();
    this.svgObserver = null;
    this.hudRoot?.querySelector('[data-production-radius-hud]')?.remove();
    this.svg?.querySelector(':scope > [data-production-radius-targets]')?.remove();
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
      this.renderHud();
      this.renderTargets();
    } finally {
      this.rendering = false;
    }
  }

  private renderHud(): void {
    const mount = this.hudRoot;
    if (!mount) return;
    const state = this.store.getState();
    const active = state.session.interaction.activeTool;
    const existing = mount.querySelector<HTMLElement>('[data-production-radius-hud]');
    if (!active || active.id !== 'radius') {
      existing?.remove();
      return;
    }

    if (active.options.placement !== 'inside' && active.options.placement !== 'outside') {
      this.tools.setToolOption(
        'placement',
        savedPlacement(mount.ownerDocument.defaultView),
      );
      return;
    }

    const options = radiusToolOptions(active);
    const selection = state.session.selection;
    const hasSelectedPiece =
      selection.kind === 'pieces' && selection.ids.length === 1;
    const signature = JSON.stringify({
      activation: active.activation,
      scope: active.scope,
      options,
      hud: state.session.interaction.hud,
      hasSelectedPiece,
    });
    if (existing?.dataset.productionRadiusSignature === signature) return;
    existing?.remove();

    const document = mount.ownerDocument;
    const hud = document.createElement('section');
    hud.className = 'lc-production-radius-hud';
    hud.dataset.productionRadiusHud = '1';
    hud.dataset.productionRadiusSignature = signature;
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
    header.className = 'lc-production-radius-hud__header';
    const title = document.createElement('strong');
    title.textContent = 'RADIUS LABELS';
    const headerActions = document.createElement('div');
    headerActions.className = 'lc-production-radius-hud__header-actions';
    const lock = button(
      document,
      active.activation === 'locked' ? 'Locked' : 'Lock',
      'lc-production-radius-hud__icon-btn',
      () => {
        if (active.activation === 'momentary') this.tools.promoteHeldToLocked();
        else this.tools.cancel();
      },
    );
    lock.title =
      active.activation === 'locked'
        ? 'Unlock and close Radius Label mode'
        : 'Lock this momentary Radius Label mode';
    const close = button(
      document,
      '×',
      'lc-production-radius-hud__icon-btn',
      () => this.tools.cancel(),
    );
    close.title = 'Exit Radius Label mode';
    headerActions.append(lock, close);
    header.append(title, headerActions);

    const scope = document.createElement('div');
    scope.className = 'lc-production-radius-hud__row';
    const scopeLabel = document.createElement('span');
    scopeLabel.textContent = 'Scope';
    const scopeGroup = document.createElement('div');
    scopeGroup.className = 'lc-production-radius-hud__segmented';
    scopeGroup.append(
      button(
        document,
        'Selected Piece',
        active.scope === 'selected' ? 'is-active' : '',
        () => this.tools.setScope('selected'),
      ),
      button(
        document,
        'All Pieces',
        active.scope !== 'selected' ? 'is-active' : '',
        () => this.tools.setScope('all'),
      ),
    );
    scope.append(scopeLabel, scopeGroup);

    const brush = document.createElement('div');
    brush.className = 'lc-production-radius-hud__row';
    const brushLabel = document.createElement('span');
    brushLabel.textContent = 'Brush';
    const brushGroup = document.createElement('div');
    brushGroup.className = 'lc-production-radius-hud__segmented';
    const setBrush = (action: RadiusBrushAction): void => {
      this.tools.setToolOption('brush', action);
    };
    brushGroup.append(
      button(
        document,
        'Add',
        options.brush === 'add' ? 'is-active' : '',
        () => setBrush('add'),
      ),
      button(
        document,
        'Erase',
        options.brush === 'erase' ? 'is-active is-danger' : '',
        () => setBrush('erase'),
      ),
    );
    brush.append(brushLabel, brushGroup);

    const placement = document.createElement('label');
    placement.className = 'lc-production-radius-hud__field';
    const placementLabel = document.createElement('span');
    placementLabel.textContent = 'Placement';
    const placementSelect = document.createElement('select');
    placementSelect.setAttribute('aria-label', 'Radius label placement');
    placementSelect.innerHTML =
      '<option value="outside">Outside</option><option value="inside">Inside</option>';
    placementSelect.value = options.placement;
    placementSelect.addEventListener('change', () => {
      const next = placementSelect.value === 'inside' ? 'inside' : 'outside';
      try {
        document.defaultView?.localStorage.setItem(RADIUS_PLACEMENT_KEY, next);
      } catch {
        // Storage is optional; ToolController memory still preserves the session choice.
      }
      this.tools.setToolOption('placement', next);
    });
    placement.append(placementLabel, placementSelect);

    const help = document.createElement('div');
    help.className = 'lc-production-radius-hud__help';
    help.textContent =
      options.brush === 'erase'
        ? 'HELP · Click labels to remove'
        : 'HELP · Click radii to add labels';
    help.title = RADIUS_HELP;

    if (active.scope === 'selected' && !hasSelectedPiece) {
      const warning = document.createElement('div');
      warning.className = 'lc-production-radius-hud__warning';
      warning.textContent = 'Select one countertop piece to use Selected Piece scope.';
      hud.append(header, scope, brush, placement, warning, help);
    } else {
      hud.append(header, scope, brush, placement, help);
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
      if (event.target instanceof Element && event.target.closest('button,select')) {
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
      event.preventDefault();
    });

    const finish = (event: PointerEvent): void => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const left = Number.parseFloat(hud.style.left || '0');
      const top = Number.parseFloat(hud.style.top || '0');
      drag = null;
      hud.classList.remove('is-dragging');
      if (Number.isFinite(left) && Number.isFinite(top)) {
        this.tools.setHudPosition(left, top);
      }
      header.releasePointerCapture?.(event.pointerId);
    };
    header.addEventListener('pointerup', finish);
    header.addEventListener('pointercancel', finish);
  }

  private renderTargets(): void {
    const svg = this.svg;
    if (!svg) return;
    svg.querySelector(':scope > [data-production-radius-targets]')?.remove();

    const state = this.store.getState();
    const active = state.session.interaction.activeTool;
    if (!active || active.id !== 'radius' || state.session.workspace !== 'design') {
      return;
    }

    const targets = createRadiusCornerTargets(state, active);
    if (!targets.length) return;
    const document = svg.ownerDocument;
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.setAttribute('data-production-radius-targets', '1');
    layer.setAttribute('class', 'lc-production-radius-targets');

    targets.forEach((target) => {
      const d = `M ${target.arc.start.x} ${target.arc.start.y} Q ${target.arc.control.x} ${target.arc.control.y} ${target.arc.end.x} ${target.arc.end.y}`;
      const preview = document.createElementNS(SVG_NS, 'path');
      preview.setAttribute('d', d);
      preview.setAttribute(
        'class',
        `lc-production-radius-target${target.occupied ? ' is-labeled' : ''}`,
      );
      preview.setAttribute('fill', 'none');
      preview.setAttribute('vector-effect', 'non-scaling-stroke');
      preview.setAttribute('pointer-events', 'none');

      const hit = document.createElementNS(SVG_NS, 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('class', 'lc-production-radius-target__hit');
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'rgba(0,0,0,.001)');
      hit.setAttribute('stroke-width', String(target.hitStrokePx));
      hit.setAttribute('vector-effect', 'non-scaling-stroke');
      hit.setAttribute('pointer-events', 'stroke');
      hit.setAttribute(
        'aria-label',
        radiusToolOptions(active).brush === 'erase'
          ? target.reference.kind === 'sink'
            ? 'Delete sink radius label'
            : 'Delete radius label'
          : target.occupied
            ? 'Radius label already exists'
            : target.reference.kind === 'sink'
              ? 'Create sink radius label'
              : 'Create radius label',
      );
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = hit.getAttribute('aria-label') ?? 'Radius label target';
      hit.append(title);
      layer.append(preview, hit);
    });

    svg.append(layer);
  }
}
