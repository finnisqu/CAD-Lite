import {
  updatePreferences,
  type AppStore,
  type CommandDispatcher,
} from '../app';
import type {
  DimensionFormat,
  EditorPreferences,
} from '../persistence';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID_PATTERN_ID = 'cad-lite-design-grid-pattern';

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
 * The DESIGN grid is rendered as a real SVG layer immediately above the canvas
 * background. PieceCanvasSurface rebuilds all SVG children during normal CAD
 * rendering, so this surface observes those rebuilds and reinstalls the grid on
 * the next animation frame. The observer is paused while the grid is mutated so
 * our own insertions cannot trigger a render loop.
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
      this.gridObserver = new MutationObserver(() => this.scheduleCanvasGrid());
      this.observeCanvas();
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

  private observeCanvas(): void {
    if (!this.gridObserver || !this.svg || !this.abort) return;
    this.gridObserver.observe(this.svg, { childList: true });
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

  private removeCanvasGridNodes(): void {
    const svg = this.svg;
    if (!svg) return;
    svg
      .querySelectorAll('[data-cad-lite-canvas-grid]')
      .forEach((node) => node.remove());
    svg.style.backgroundImage = '';
    svg.style.backgroundSize = '';
    svg.style.backgroundPosition = '';
    svg.style.backgroundColor = '';
  }

  private clearCanvasGrid(): void {
    const svg = this.svg;
    if (!svg) return;
    this.removeCanvasGridNodes();
    const background = svg.querySelector<SVGRectElement>('.lc-canvas-background');
    background?.setAttribute('fill', '#ffffff');
  }

  private renderCanvasGrid(): void {
    const svg = this.svg;
    if (!svg) return;

    this.gridObserver?.disconnect();
    try {
      this.removeCanvasGridNodes();

      const background = svg.querySelector<SVGRectElement>('.lc-canvas-background');
      background?.setAttribute('fill', '#ffffff');

      const state = this.store.getState();
      const layout = state.project.layouts.find(
        (item) => item.id === state.session.activeLayoutId,
      );
      if (
        !layout ||
        state.session.workspace !== 'design' ||
        !state.preferences.showGrid ||
        !Number.isFinite(layout.grid) ||
        layout.grid <= 0 ||
        !background
      ) {
        return;
      }

      const scale = Math.max(0.001, Math.abs(layout.scale || 1));
      const major = layout.grid * 6;
      if (!Number.isFinite(major) || major <= 0) return;

      const document = svg.ownerDocument;
      const defs = document.createElementNS(SVG_NS, 'defs');
      defs.dataset.cadLiteCanvasGrid = 'defs';

      const pattern = document.createElementNS(SVG_NS, 'pattern');
      pattern.id = GRID_PATTERN_ID;
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('width', String(major));
      pattern.setAttribute('height', String(major));
      // Major lines sit exactly on each repeating tile boundary. SVG patterns
      // clip boundary strokes by default, which made every sixth grid line
      // disappear. Preserve the exact grid coordinate and allow the stroke to
      // extend across the tile edge instead of nudging the visual grid.
      pattern.setAttribute('overflow', 'visible');

      const minorSegments: string[] = [];
      for (let index = 1; index < 6; index += 1) {
        const offset = layout.grid * index;
        minorSegments.push(
          `M ${offset} 0 V ${major}`,
          `M 0 ${offset} H ${major}`,
        );
      }
      const minorPath = document.createElementNS(SVG_NS, 'path');
      minorPath.setAttribute('d', minorSegments.join(' '));
      minorPath.setAttribute('fill', 'none');
      minorPath.setAttribute('stroke', '#e1e5ea');
      minorPath.setAttribute('stroke-width', String(0.7 / scale));
      minorPath.setAttribute('shape-rendering', 'crispEdges');

      const majorPath = document.createElementNS(SVG_NS, 'path');
      majorPath.setAttribute(
        'd',
        `M 0 0 H ${major} M 0 0 V ${major}`,
      );
      majorPath.setAttribute('fill', 'none');
      majorPath.setAttribute('stroke', '#c4cbd4');
      majorPath.setAttribute('stroke-width', String(1 / scale));
      majorPath.setAttribute('shape-rendering', 'crispEdges');

      pattern.append(minorPath, majorPath);
      defs.appendChild(pattern);

      const grid = document.createElementNS(SVG_NS, 'rect');
      grid.setAttribute('class', 'lc-canvas-grid');
      grid.dataset.cadLiteCanvasGrid = 'layer';
      grid.setAttribute('x', '0');
      grid.setAttribute('y', '0');
      grid.setAttribute('width', '100%');
      grid.setAttribute('height', '100%');
      grid.setAttribute('fill', `url(#${GRID_PATTERN_ID})`);
      grid.setAttribute('pointer-events', 'none');

      background.insertAdjacentElement('afterend', defs);
      defs.insertAdjacentElement('afterend', grid);
    } finally {
      this.observeCanvas();
    }
  }
}
