import type { ApplicationState } from './state';
import type { AppStore } from './store';

export interface ApplicationStatePreviewScope {
  replace: (nextState: ApplicationState, label?: string) => void;
}

/**
 * Owns temporary whole-application state swaps used by browser presentation
 * flows that need the normal renderer to draw a non-active view.
 *
 * Preview swaps are system commits, so AppStore.replaceState() skips history
 * and persistence. The baseline state is restored even when the async browser
 * operation throws.
 */
export class ApplicationStatePreview {
  constructor(private readonly store: AppStore) {}

  async run<T>(
    operation: (scope: ApplicationStatePreviewScope) => Promise<T>,
  ): Promise<T> {
    const baseline = this.store.getState();
    const restoreState: ApplicationState = {
      project: baseline.project,
      session: baseline.session,
      preferences: baseline.preferences,
    };
    let replaced = false;

    const scope: ApplicationStatePreviewScope = {
      replace: (nextState, label = 'Preview application state') => {
        replaced = true;
        this.store.replaceState(nextState, label);
      },
    };

    try {
      return await operation(scope);
    } finally {
      if (replaced) {
        this.store.replaceState(
          restoreState,
          'Restore application state preview',
        );
      }
    }
  }
}
