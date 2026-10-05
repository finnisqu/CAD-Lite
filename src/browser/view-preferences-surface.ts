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
 * This surface also restores the DESIGN canvas grid from the same canonical
 * showGrid + Layout.grid settings. The grid is decorative only; annotation and
 * piece snapping continue to use the typed interaction geometry.
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
  private gridRenderQueued = false;
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
        if (!this.svg?.querySelector('[data-cad-lite-grid]')) {
          this.scheduleCanvasGrid();
        }
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
    this.gridRenderQueued = false;
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

  private scheduleCanvasGrid(): void {
    if (this.gridRenderQueued) return;
    this.gridRenderQueued = true;
    queueMicrotask(() => {
      this.gridRenderQueued = false;
      this.renderCanvasGrid();
    });
  }

  private renderCanvasGrid(): void {
    const svg = this.svg;
    if (!svg) return;

    svg.querySelector('[data-cad-lite-grid]')?.remove();

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
      return;
    }

    const width = Math.max(0, layout.cw);
    const height = Math.max(0, layout.ch);
    const step = layout.grid;
    if (width <= 0 || height <= 0) return;

    const document = svg.ownerDocument;
    const grid = document.createElementNS(SVG_NS, 'g');
    grid.dataset.cadLiteGrid = '1';
    grid.setAttribute('class', 'lc-canvas-grid');
    grid.setAttribute('pointer-events', 'none');

    const appendLine = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      major: boolean,
    ): void => {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute(
        'class',
        `lc-canvas-grid-line ${major ? 'lc-canvas-grid-line--major' : 'lc-canvas-grid-line--minor'}`,
      );
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('stroke', major ? '#d1d5db' : '#e5e7eb');
      line.setAttribute('stroke-width', major ? '1.25' : '0.5');
      line.setAttribute('stroke-opacity', major ? '0.9' : '0.7');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      grid.appendChild(line);
    };

    const verticalCount = Math.floor(width / step + 1e-9);
    for (let index = 1; index <= verticalCount; index += 1) {
      const x = index * step;
      if (x >= width - 1e-9) break;
      appendLine(x, 0, x, height, index % 6 === 0);
    }

    const horizontalCount = Math.floor(height / step + 1e-9);
    for (let index = 1; index <= horizontalCount; index += 1) {
      const y = index * step;
      if (y >= height - 1e-9) break;
      appendLine(0, y, width, y, index % 6 === 0);
    }

    const background = svg.querySelector('.lc-canvas-background');
    if (background) background.after(grid);
    else svg.prepend(grid);
  }
}
