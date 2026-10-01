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
 */
export class ViewPreferencesSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private abort: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private formatControl: HTMLSelectElement | null = null;
  private precisionControl: HTMLSelectElement | null = null;
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

    this.unsubscribe = this.store.subscribe((event) => {
      if (event.changed.preferences) this.render();
    });
    this.render();
  }

  unmount(): void {
    this.abort?.abort();
    this.abort = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
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
  }
}
