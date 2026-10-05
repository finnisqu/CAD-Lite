import {
  updatePreferences,
  type AppStore,
  type CommandDispatcher,
} from '../app';
import type {
  DimensionFormat,
  EditorPreferences,
} from '../persistence';

export type DimensionPrecision = 1 | 2 | 4 | 8 | 16;
export type BooleanViewPreference =
  | 'showGrid'
  | 'showDims'
  | 'showManualDims'
  | 'showNotes'
  | 'showLines'
  | 'showPieceFills'
  | 'showRoomFeatures'
  | 'showRoomFeatureLabels'
  | 'showRoomCabinets'
  | 'showRoomFillersPanels'
  | 'showRoomAppliances'
  | 'showRoomWalls';

const BOOLEAN_VIEW_CONTROLS: ReadonlyArray<{
  id: string;
  preference: BooleanViewPreference;
}> = [
  { id: 'lc-show-grid', preference: 'showGrid' },
  { id: 'lc-show-dims', preference: 'showDims' },
  { id: 'lc-show-manual-dims', preference: 'showManualDims' },
  { id: 'lc-show-notes', preference: 'showNotes' },
  { id: 'lc-show-lines', preference: 'showLines' },
  { id: 'lc-show-piece-fills', preference: 'showPieceFills' },
  { id: 'lc-show-room-features', preference: 'showRoomFeatures' },
  { id: 'lc-show-room-feature-labels', preference: 'showRoomFeatureLabels' },
  { id: 'lc-show-room-cabinets', preference: 'showRoomCabinets' },
  { id: 'lc-show-room-fillers-panels', preference: 'showRoomFillersPanels' },
  { id: 'lc-show-room-appliances', preference: 'showRoomAppliances' },
  { id: 'lc-show-room-walls', preference: 'showRoomWalls' },
];

export interface ViewPreferencesSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
}

export function dimensionFormatFromControl(
  value: string,
): DimensionFormat | null {
  return value === 'fraction' || value === 'decimal' ? value : null;
}

export function dimensionPrecisionFromControl(
  value: string,
): DimensionPrecision | null {
  const precision = Number(value);
  return precision === 1 ||
    precision === 2 ||
    precision === 4 ||
    precision === 8 ||
    precision === 16
    ? precision
    : null;
}

export function booleanViewPreferenceFromControlId(
  id: string,
): BooleanViewPreference | null {
  return (
    BOOLEAN_VIEW_CONTROLS.find((control) => control.id === id)?.preference ?? null
  );
}

/**
 * Browser binding for shared View preferences.
 *
 * The controls intentionally dispatch the existing typed preferences command;
 * formatting and visibility state stay outside drawing entities. Number format
 * remains shared between DESIGN and SLAB, while workspace-view persistence is
 * handled by the existing preferences command boundary.
 *
 * The DESIGN grid is painted as an SVG-element CSS background rather than as
 * disposable child nodes. PieceCanvasSurface replaces all SVG children during
 * normal pointer/render activity, so a child-node grid can disappear between
 * frames. The background survives those replacements; this surface only makes
 * the canvas background rect transparent after each renderer pass so the grid
 * remains visible underneath CAD entities.
 */
export class ViewPreferencesSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private abort: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private formatControl: HTMLSelectElement | null = null;
  private precisionControl: HTMLSelectElement | null = null;
  private svg: SVGSVGElement | null = null;
  private gridObserver: MutationObserver | null = null;
  private gridRenderFrame: number | null = null;
  private booleanControls: Array<{
    element: HTMLButtonElement;
    preference: BooleanViewPreference;
  }> = [];

  constructor(options: ViewPreferencesSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
  }

  mount(): void {
    if (this.abort) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.formatControl =
      this.root.querySelector<HTMLSelectElement>('#lc-dim-format');
    this.precisionControl =
      this.root.querySelector<HTMLSelectElement>('#lc-dim-precision');
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    this.booleanControls = BOOLEAN_VIEW_CONTROLS.flatMap((control) => {
      const element = this.root.querySelector<HTMLButtonElement>(`#${control.id}`);
      return element ? [{ element, preference: control.preference }] : [];
    });

    this.formatControl?.addEventListener(
      'change',
      () => {
        const format = dimensionFormatFromControl(
          this.formatControl?.value ?? '',
        );
        if (format) this.commands.execute(updatePreferences({ dimFormat: format }));
      },
      { signal },
    );

    this.precisionControl?.addEventListener(
      'change',
      () => {
        const precision = dimensionPrecisionFromControl(
          this.precisionControl?.value ?? '',
        );
        if (precision) {
          this.commands.execute(updatePreferences({ dimPrecision: precision }));
        }
      },
      { signal },
    );

    this.booleanControls.forEach(({ element, preference }) => {
      element.addEventListener(
        'click',
        () => {
          const current = this.store.getState().preferences[preference];
          const patch = { [preference]: !current } as Partial<EditorPreferences>;
          this.commands.execute(updatePreferences(patch));
        },
        { signal },
      );
    });

    if (this.svg && typeof MutationObserver !== 'undefined') {
      this.gridObserver = new MutationObserver(() => {
        // PieceCanvasSurface rebuilds the SVG synchronously with replaceChildren.
        // Restore the transparent background on the next animation frame after
        // every such rebuild; no grid DOM nodes are involved, so this observer
        // cannot trigger itself recursively.
        this.scheduleCanvasGrid();
      });
      this.gridObserver.observe(this.svg, { childList: true });
    }

    this.unsubscribe = this.store.subscribe((event) => {
      if (
        event.changed.preferences ||
        event.changed.project ||
        event.changed.session
      ) {
        this.render();
      }
    });
    this.render();
  }

  unmount(): void {
    this.abort?.abort();
    this.abort = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.gridObserver?.disconnect();
    this.gridObserver = null;
    this.cancelGridFrame();
    this.clearCanvasGrid();
    this.svg = null;
    this.booleanControls = [];
  }

  render(): void {
    const preferences = this.store.getState().preferences;
    if (this.formatControl) {
      this.formatControl.value = preferences.dimFormat;
    }
    if (this.precisionControl) {
      this.precisionControl.value = String(preferences.dimPrecision);
      this.precisionControl.disabled = preferences.dimFormat === 'decimal';
    }
    this.booleanControls.forEach(({ element, preference }) => {
      const active = preferences[preference];
      element.setAttribute('aria-pressed', String(active));
      element.classList.toggle('is-active', active);
    });
    this.scheduleCanvasGrid();
  }

  private cancelGridFrame(): void {
    if (this.gridRenderFrame === null) return;
    const view = this.svg?.ownerDocument.defaultView;
    view?.cancelAnimationFrame(this.gridRenderFrame);
    this.gridRenderFrame = null;
  }

  private scheduleCanvasGrid(): void {
    if (this.gridRenderFrame !== null) return;
    const view = this.svg?.ownerDocument.defaultView;
    if (!view) {
      queueMicrotask(() => this.renderCanvasGrid());
      return;
    }
    this.gridRenderFrame = view.requestAnimationFrame(() => {
      this.gridRenderFrame = null;
      this.renderCanvasGrid();
    });
  }

  private clearCanvasGrid(): void {
    const svg = this.svg;
    if (!svg) return;
    svg.style.backgroundImage = '';
    svg.style.backgroundSize = '';
    svg.style.backgroundPosition = '';
    svg.style.backgroundColor = '#ffffff';
    const background = svg.querySelector<SVGRectElement>('.lc-canvas-background');
    background?.setAttribute('fill', '#ffffff');
  }

  private renderCanvasGrid(): void {
    const svg = this.svg;
    if (!svg) return;

    const state = this.store.getState();
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    if (
      !layout ||
      state.session.workspace !== 'design' ||
      !state.preferences.showGrid ||
      !Number.isFinite(layout.grid) ||
      layout.grid <= 0
    ) {
      this.clearCanvasGrid();
      return;
    }

    const scale = Math.max(0.001, Math.abs(layout.scale || 1));
    const minor = layout.grid * scale;
    const major = minor * 6;
    if (!Number.isFinite(minor) || minor <= 0 || !Number.isFinite(major)) {
      this.clearCanvasGrid();
      return;
    }

    // Four gradients create one minor vertical/horizontal grid and a stronger
    // sixth-line rhythm. Sizes are CSS pixels, so multiplying world-inch grid
    // spacing by the Layout scale keeps the background aligned with the SVG
    // viewBox at every zoom level.
    svg.style.backgroundColor = '#ffffff';
    svg.style.backgroundImage = [
      'linear-gradient(to right, #d1d5db 1px, transparent 1px)',
      'linear-gradient(to bottom, #d1d5db 1px, transparent 1px)',
      'linear-gradient(to right, #e5e7eb 1px, transparent 1px)',
      'linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
    ].join(', ');
    svg.style.backgroundSize = [
      `${major}px ${major}px`,
      `${major}px ${major}px`,
      `${minor}px ${minor}px`,
      `${minor}px ${minor}px`,
    ].join(', ');
    svg.style.backgroundPosition = '0 0, 0 0, 0 0, 0 0';

    const background = svg.querySelector<SVGRectElement>('.lc-canvas-background');
    background?.setAttribute('fill', 'transparent');
  }
}
