import {
  createEdgePainterTargets,
  edgePainterToolOptions,
  normalizeEdgePainterProfile,
  DEFAULT_EDGE_PAINTER_PROFILE,
  EDGE_PAINTER_PROFILE_KEY,
  EDGE_PAINTER_PROFILES,
  type AppStore,
  type EdgePainterBrushAction,
  type ToolController,
} from '../app';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EDGE_PAINTER_HELP =
  'Click Piece edges to apply or erase edge profiles. Scope controls whether targets come from the selected piece or all pieces. Hold E for momentary mode; Shift+E locks it. Enter or Escape exits.';

export interface ProductionEdgePainterSurfaceOptions {
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

function savedProfile(view: Window | null): string {
  try {
    return normalizeEdgePainterProfile(
      view?.localStorage.getItem(EDGE_PAINTER_PROFILE_KEY),
    );
  } catch {
    return DEFAULT_EDGE_PAINTER_PROFILE;
  }
}

export class ProductionEdgePainterSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly tools: ToolController;
  private hudRoot: HTMLElement | null = null;
  private svg: SVGSVGElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private svgObserver: MutationObserver | null = null;
  private scheduled = false;
  private rendering = false;

  constructor(options: ProductionEdgePainterSurfaceOptions) {
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
          this.store.getState().session.interaction.activeTool?.id === 'edgePainter';
        if (
          active &&
          !this.svg?.querySelector(':scope > [data-production-edge-painter-targets]')
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
    this.hudRoot?.querySelector('[data-production-edge-painter-hud]')?.remove();
    this.svg
      ?.querySelector(':scope > [data-production-edge-painter-targets]')
      ?.remove();
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
    const existing = mount.querySelector<HTMLElement>(
      '[data-production-edge-painter-hud]',
    );
    if (!active || active.id !== 'edgePainter') {
      existing?.remove();
      return;
    }

    if (typeof active.options.profile !== 'string') {
      this.tools.setToolOption(
        'profile',
        savedProfile(mount.ownerDocument.defaultView),
      );
      return;
    }

    const options = edgePainterToolOptions(active);
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
    if (existing?.dataset.productionEdgePainterSignature === signature) return;
    existing?.remove();

    const document = mount.ownerDocument;
    const hud = document.createElement('section');
    hud.className = 'lc-production-edge-painter-hud';
    hud.dataset.productionEdgePainterHud = '1';
    hud.dataset.productionEdgePainterSignature = signature;
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
    header.className = 'lc-production-edge-painter-hud__header';
    const title = document.createElement('strong');
    title.textContent = 'EDGE PAINTER';
    const headerActions = document.createElement('div');
    headerActions.className = 'lc-production-edge-painter-hud__header-actions';
    const lock = button(
      document,
      active.activation === 'locked' ? 'Locked' : 'Lock',
      'lc-production-edge-painter-hud__icon-btn',
      () => {
        if (active.activation === 'momentary') this.tools.promoteHeldToLocked();
        else this.tools.cancel();
      },
    );
    lock.title =
      active.activation === 'locked'
        ? 'Unlock and close Edge Painter mode'
        : 'Lock this momentary Edge Painter mode';
    const close = button(
      document,
      '×',
      'lc-production-edge-painter-hud__icon-btn',
      () => this.tools.cancel(),
    );
    close.title = 'Exit Edge Painter mode';
    headerActions.append(lock, close);
    header.append(title, headerActions);

    const scope = document.createElement('div');
    scope.className = 'lc-production-edge-painter-hud__row';
    const scopeLabel = document.createElement('span');
    scopeLabel.textContent = 'Scope';
    const scopeGroup = document.createElement('div');
    scopeGroup.className = 'lc-production-edge-painter-hud__segmented';
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
    brush.className = 'lc-production-edge-painter-hud__row';
    const brushLabel = document.createElement('span');
    brushLabel.textContent = 'Brush';
    const brushGroup = document.createElement('div');
    brushGroup.className = 'lc-production-edge-painter-hud__segmented';
    const setBrush = (action: EdgePainterBrushAction): void => {
      this.tools.setToolOption('brush', action);
    };
    brushGroup.append(
      button(
        document,
        'Paint',
        options.brush === 'paint' ? 'is-active' : '',
        () => setBrush('paint'),
      ),
      button(
        document,
        'Erase',
        options.brush === 'erase' ? 'is-active is-danger' : '',
        () => setBrush('erase'),
      ),
    );
    brush.append(brushLabel, brushGroup);

    const profile = document.createElement('label');
    profile.className = 'lc-production-edge-painter-hud__field';
    const profileLabel = document.createElement('span');
    profileLabel.textContent = 'Profile';
    const profileSelect = document.createElement('select');
    profileSelect.setAttribute('aria-label', 'Edge profile to paint');
    EDGE_PAINTER_PROFILES.forEach((option) => {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      profileSelect.append(item);
    });
    profileSelect.value = options.profile;
    profileSelect.disabled = options.brush === 'erase';
    profileSelect.addEventListener('change', () => {
      const next = normalizeEdgePainterProfile(profileSelect.value);
      try {
        document.defaultView?.localStorage.setItem(EDGE_PAINTER_PROFILE_KEY, next);
      } catch {
        // Storage is optional; ToolController memory still preserves the session choice.
      }
      this.tools.setToolOption('profile', next);
    });
    profile.append(profileLabel, profileSelect);

    const help = document.createElement('div');
    help.className = 'lc-production-edge-painter-hud__help';
    help.textContent =
      active.scope === 'selected' && !hasSelectedPiece
        ? 'HELP · Select one piece to paint'
        : options.brush === 'erase'
          ? 'HELP · Click profiled edges to erase'
          : 'HELP · Click edges to apply profiles';
    help.title = EDGE_PAINTER_HELP;

    if (active.scope === 'selected' && !hasSelectedPiece) {
      const warning = document.createElement('div');
      warning.className = 'lc-production-edge-painter-hud__warning';
      warning.textContent = 'Select one countertop piece to use Selected Piece scope.';
      hud.append(header, scope, brush, profile, warning, help);
    } else {
      hud.append(header, scope, brush, profile, help);
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
    svg
      .querySelector(':scope > [data-production-edge-painter-targets]')
      ?.remove();

    const state = this.store.getState();
    const active = state.session.interaction.activeTool;
    if (
      !active ||
      active.id !== 'edgePainter' ||
      state.session.workspace !== 'design'
    ) {
      return;
    }

    const targets = createEdgePainterTargets(state, active);
    if (!targets.length) return;
    const options = edgePainterToolOptions(active);
    const document = svg.ownerDocument;
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.setAttribute('data-production-edge-painter-targets', '1');
    layer.setAttribute('class', 'lc-production-edge-painter-targets');

    targets.forEach((target) => {
      const preview = document.createElementNS(SVG_NS, 'line');
      preview.setAttribute('x1', String(target.start.x));
      preview.setAttribute('y1', String(target.start.y));
      preview.setAttribute('x2', String(target.end.x));
      preview.setAttribute('y2', String(target.end.y));
      preview.setAttribute(
        'class',
        `lc-production-edge-painter-target${target.profiled ? ' is-profiled' : ''}${
          options.brush === 'erase' ? ' is-erasing' : ''
        }`,
      );
      preview.setAttribute('vector-effect', 'non-scaling-stroke');
      preview.setAttribute('pointer-events', 'none');

      const hit = document.createElementNS(SVG_NS, 'line');
      hit.setAttribute('x1', String(target.start.x));
      hit.setAttribute('y1', String(target.start.y));
      hit.setAttribute('x2', String(target.end.x));
      hit.setAttribute('y2', String(target.end.y));
      hit.setAttribute('class', 'lc-production-edge-painter-target__hit');
      hit.setAttribute('stroke', 'rgba(0,0,0,.001)');
      hit.setAttribute('stroke-width', String(target.hitStrokePx));
      hit.setAttribute('vector-effect', 'non-scaling-stroke');
      hit.setAttribute('pointer-events', 'stroke');
      hit.setAttribute(
        'aria-label',
        options.brush === 'erase'
          ? `Erase ${target.currentProfile} profile from ${target.side} edge`
          : `Apply ${options.profile} profile to ${target.side} edge`,
      );
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = hit.getAttribute('aria-label') ?? 'Edge Painter target';
      hit.append(title);
      layer.append(preview, hit);
    });

    svg.append(layer);
  }
}
