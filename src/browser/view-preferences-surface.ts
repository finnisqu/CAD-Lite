import {
  updatePreferences,
  type AppStore,
  type CommandDispatcher,
} from '../app';
import type { DimensionFormat } from '../persistence';

export type DimensionPrecision = 1 | 2 | 4 | 8 | 16;

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

/**
 * Browser binding for shared number-format preferences.
 *
 * The controls intentionally dispatch the existing typed preferences command;
 * formatting state stays outside drawing entities and remains shared between
 * DESIGN and SLAB, matching the production preference model.
 */
export class ViewPreferencesSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private abort: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private formatControl: HTMLSelectElement | null = null;
  private precisionControl: HTMLSelectElement | null = null;

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
  }
}
