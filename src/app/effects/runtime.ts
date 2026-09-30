import {
  AutosaveManager,
  type AutosaveManagerOptions,
  type AutosaveStorage,
} from './autosave';
import {
  ViewInvalidationCoordinator,
  type ViewInvalidationScheduler,
} from './invalidation';
import {
  HistoryManager,
  type HistoryManagerOptions,
} from '../history';
import type { AppStore } from '../store';

export interface ApplicationEffectsOptions {
  autosaveStorage: AutosaveStorage;
  autosave?: AutosaveManagerOptions;
  history?: HistoryManagerOptions;
  invalidationScheduler?: ViewInvalidationScheduler;
}

export class ApplicationEffects {
  readonly history: HistoryManager;
  readonly autosave: AutosaveManager;
  readonly invalidation: ViewInvalidationCoordinator;
  private started = false;

  constructor(
    store: AppStore,
    options: ApplicationEffectsOptions,
  ) {
    this.history = new HistoryManager(store, options.history);
    this.autosave = new AutosaveManager(
      store,
      options.autosaveStorage,
      options.autosave,
    );
    this.invalidation = new ViewInvalidationCoordinator(
      store,
      options.invalidationScheduler,
    );
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    // Register history first so history button state is current before the
    // coalesced UI invalidation callback runs.
    this.history.start();
    this.autosave.start();
    this.invalidation.start();
  }

  stop(flushAutosave = false): void {
    if (!this.started) return;
    this.started = false;

    this.history.stop();
    this.invalidation.stop();
    this.autosave.dispose(flushAutosave);
  }
}
