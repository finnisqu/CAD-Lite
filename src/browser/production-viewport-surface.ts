import {
  MAX_CANVAS_SCALE,
  MIN_CANVAS_SCALE,
  updateLayoutViewport,
  type AppStore,
  type CommandDispatcher,
} from '../app';

export const PRODUCTION_ZOOM_STEP = 0.5;
export const PRODUCTION_THEME_KEY = 'litecad:theme';

export type ProductionThemeMode = 'light' | 'dark' | 'system';

export interface ProductionViewportSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
}

export function nextProductionCanvasScale(
  current: number,
  direction: -1 | 1,
): number {
  const value = Number.isFinite(current) ? current : MIN_CANVAS_SCALE;
  return Math.max(
    MIN_CANVAS_SCALE,
    Math.min(MAX_CANVAS_SCALE, value + direction * PRODUCTION_ZOOM_STEP),
  );
}

export function resolveProductionTheme(
  mode: ProductionThemeMode,
  systemDark: boolean,
): 'light' | 'dark' {
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
}

function ownerDocument(root: ParentNode): Document | null {
  if (typeof Document !== 'undefined' && root instanceof Document) return root;
  return (root as Node).ownerDocument ?? null;
}

function editableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('input,textarea,select,[contenteditable="true"]'))
  );
}

function themeMode(value: string | null): ProductionThemeMode {
  return value === 'dark' || value === 'system' ? value : 'light';
}

/**
 * Owns production-shell viewport chrome: persisted Layout zoom/canvas/grid
 * controls, native Fullscreen, Theater mode, and shell-local appearance.
 * CAD mutations still flow through typed commands.
 */
export class ProductionViewportSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private abort: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private shell: HTMLElement | null = null;
  private document: Document | null = null;
  private theater = false;
  private theme: ProductionThemeMode = 'light';
  private themeMedia: MediaQueryList | null = null;
  private themeMediaListener: ((event: MediaQueryListEvent) => void) | null = null;

  constructor(options: ProductionViewportSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
  }

  mount(): void {
    if (this.abort) return;
    const shell = this.root.querySelector<HTMLElement>(
      '[data-cad-lite-production-shell]',
    );
    const document = ownerDocument(this.root);
    if (!shell || !document) return;

    this.shell = shell;
    this.document = document;
    this.abort = new AbortController();
    const signal = this.abort.signal;

    try {
      this.theme = themeMode(
        document.defaultView?.localStorage.getItem(PRODUCTION_THEME_KEY) ?? null,
      );
    } catch {
      this.theme = 'light';
    }
    this.themeMedia =
      document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
    this.themeMediaListener = () => {
      if (this.theme === 'system') this.renderTheme();
    };
    this.themeMedia?.addEventListener('change', this.themeMediaListener);

    shell.querySelector<HTMLButtonElement>('#lc-zoom-out')?.addEventListener(
      'click',
      () => this.zoom(-1),
      { signal },
    );
    shell.querySelector<HTMLButtonElement>('#lc-zoom-in')?.addEventListener(
      'click',
      () => this.zoom(1),
      { signal },
    );
    shell.querySelector<HTMLButtonElement>('#lc-theater-mode')?.addEventListener(
      'click',
      () => void this.toggleTheater(),
      { signal },
    );
    shell.querySelector<HTMLButtonElement>('#lc-fullscreen-mode')?.addEventListener(
      'click',
      () => void this.toggleFullscreen(),
      { signal },
    );

    const bindNumber = (
      selector: string,
      key: 'width' | 'height' | 'scale' | 'grid',
    ): void => {
      shell.querySelector<HTMLInputElement>(selector)?.addEventListener(
        'change',
        (event) => {
          const input = event.currentTarget as HTMLInputElement;
          const layoutId = this.store.getState().session.activeLayoutId;
          if (!layoutId) return;
          this.commands.execute(
            updateLayoutViewport(layoutId, { [key]: Number(input.value) }),
          );
          this.render();
        },
        { signal },
      );
    };
    bindNumber('#lc-view-canvas-width', 'width');
    bindNumber('#lc-view-canvas-height', 'height');
    bindNumber('#lc-view-canvas-grid', 'grid');
    bindNumber('#lc-view-canvas-zoom', 'scale');

    shell
      .querySelectorAll<HTMLButtonElement>('[data-cad-lite-theme]')
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            this.setTheme(themeMode(button.dataset.cadLiteTheme ?? null));
          },
          { signal },
        );
      });

    document.addEventListener(
      'fullscreenchange',
      () => {
        if (document.fullscreenElement && this.theater) this.setTheater(false);
        this.renderFocusModes();
      },
      { signal },
    );
    document.defaultView?.addEventListener(
      'keydown',
      (event) => this.onKeyDown(event),
      { signal },
    );
    document.defaultView?.addEventListener(
      'resize',
      () => {
        if (this.theater) this.syncHeaderOffset();
      },
      { signal },
    );

    this.unsubscribe = this.store.subscribe(() => this.render());
    this.syncHeaderOffset();
    this.render();
  }

  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.themeMedia && this.themeMediaListener) {
      this.themeMedia.removeEventListener('change', this.themeMediaListener);
    }
    this.themeMedia = null;
    this.themeMediaListener = null;
    this.setTheater(false);
    this.abort?.abort();
    this.abort = null;
    this.shell = null;
    this.document = null;
  }

  private activeLayout() {
    const state = this.store.getState();
    return (
      state.project.layouts.find(
        (layout) => layout.id === state.session.activeLayoutId,
      ) ?? null
    );
  }

  private zoom(direction: -1 | 1): boolean {
    const layout = this.activeLayout();
    if (!layout) return false;
    const scale = nextProductionCanvasScale(layout.scale, direction);
    return Boolean(
      this.commands.execute(updateLayoutViewport(layout.id, { scale })),
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || editableTarget(event.target)) return;

    if (
      event.key === 'Escape' &&
      this.theater &&
      !this.document?.fullscreenElement
    ) {
      this.setTheater(false);
      event.preventDefault();
      return;
    }

    if (
      !event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }

    if (event.key === '+' || event.key === '=') {
      if (this.zoom(1)) event.preventDefault();
      return;
    }
    if (event.key === '-' || event.key === '_') {
      if (this.zoom(-1)) event.preventDefault();
    }
  }

  private async toggleTheater(): Promise<void> {
    const document = this.document;
    if (!document) return;
    const entering = !this.theater;
    if (!entering) {
      this.setTheater(false);
      return;
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        return;
      }
    }
    this.syncHeaderOffset();
    this.setTheater(true);
  }

  private setTheater(enabled: boolean): void {
    const shell = this.shell;
    const document = this.document;
    this.theater = enabled;
    shell?.classList.toggle('is-theater', enabled);
    document?.documentElement.classList.toggle('cad-lite-page-lock', enabled);
    document?.body?.classList.toggle('cad-lite-page-lock', enabled);
    this.renderFocusModes();
  }

  private async toggleFullscreen(): Promise<void> {
    const shell = this.shell;
    const document = this.document;
    if (!shell || !document) return;

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen?.();
      } catch {
        // Native browser Fullscreen can reject when not initiated by the user.
      }
      return;
    }

    if (this.theater) this.setTheater(false);
    try {
      await shell.requestFullscreen?.();
    } catch {
      // Keep the shell usable when Fullscreen is unavailable or blocked.
    }
  }

  private setTheme(mode: ProductionThemeMode): void {
    this.theme = mode;
    try {
      this.document?.defaultView?.localStorage.setItem(PRODUCTION_THEME_KEY, mode);
    } catch {
      // Appearance preference should never block CAD interaction.
    }
    this.renderTheme();
  }

  private renderTheme(): void {
    const shell = this.shell;
    if (!shell) return;
    const resolved = resolveProductionTheme(
      this.theme,
      Boolean(this.themeMedia?.matches),
    );
    shell.dataset.theme = resolved;
    shell.dataset.themeMode = this.theme;
    shell.dataset.themeResolved = resolved;
    shell
      .querySelectorAll<HTMLButtonElement>('[data-cad-lite-theme]')
      .forEach((button) => {
        const active = button.dataset.cadLiteTheme === this.theme;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
  }

  private renderFocusModes(): void {
    const shell = this.shell;
    const document = this.document;
    if (!shell || !document) return;
    const fullscreen = document.fullscreenElement === shell;
    shell.classList.toggle('is-fullscreen', fullscreen);

    const theater = shell.querySelector<HTMLButtonElement>('#lc-theater-mode');
    if (theater) {
      theater.classList.toggle('is-active', this.theater);
      theater.setAttribute('aria-pressed', String(this.theater));
      theater.title = this.theater ? 'Exit Theater Mode' : 'Theater Mode';
      theater.setAttribute('aria-label', theater.title);
    }
    const fullscreenButton =
      shell.querySelector<HTMLButtonElement>('#lc-fullscreen-mode');
    if (fullscreenButton) {
      fullscreenButton.classList.toggle('is-active', fullscreen);
      fullscreenButton.setAttribute('aria-pressed', String(fullscreen));
      fullscreenButton.title = fullscreen ? 'Exit Fullscreen' : 'Fullscreen';
      fullscreenButton.setAttribute('aria-label', fullscreenButton.title);
    }
  }

  private render(): void {
    this.renderTheme();
    this.renderFocusModes();
    const shell = this.shell;
    const layout = this.activeLayout();
    if (!shell || !layout) return;
    const state = this.store.getState();

    const zoomOut = shell.querySelector<HTMLButtonElement>('#lc-zoom-out');
    const zoomIn = shell.querySelector<HTMLButtonElement>('#lc-zoom-in');
    if (zoomOut) {
      zoomOut.disabled = layout.scale <= MIN_CANVAS_SCALE;
      zoomOut.title =
        `Zoom Out (${layout.scale} → ${nextProductionCanvasScale(layout.scale, -1)} px/in)`;
    }
    if (zoomIn) {
      zoomIn.disabled = layout.scale >= MAX_CANVAS_SCALE;
      zoomIn.title =
        `Zoom In (${layout.scale} → ${nextProductionCanvasScale(layout.scale, 1)} px/in)`;
    }

    const width = shell.querySelector<HTMLInputElement>('#lc-view-canvas-width');
    const height = shell.querySelector<HTMLInputElement>('#lc-view-canvas-height');
    const grid = shell.querySelector<HTMLInputElement>('#lc-view-canvas-grid');
    const zoom = shell.querySelector<HTMLInputElement>('#lc-view-canvas-zoom');
    const sizeLocked = Boolean(layout.plan) || state.session.workspace !== 'design';

    if (width) {
      width.value = String(layout.cw);
      width.disabled = sizeLocked;
      width.title = layout.plan
        ? 'Canvas size follows the Floor Plan.'
        : state.session.workspace === 'slab'
          ? 'Canvas width applies to DESIGN.'
          : '';
    }
    if (height) {
      height.value = String(layout.ch);
      height.disabled = sizeLocked;
      height.title = width?.title ?? '';
    }
    if (grid) grid.value = String(layout.grid);
    if (zoom) zoom.value = String(layout.scale);
  }

  private syncHeaderOffset(): void {
    const document = this.document;
    if (!document) return;
    const header =
      document.querySelector<HTMLElement>('[data-animation-role="header"]') ??
      document.querySelector<HTMLElement>('.Header');
    const height = header ? Math.round(header.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--site-header-h', `${height}px`);
  }
}
