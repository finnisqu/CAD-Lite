import type { AppStore, StoreChangeEvent } from '../store';

export type ViewInvalidationTarget =
  | 'canvas'
  | 'navigator'
  | 'inspector'
  | 'toolbar'
  | 'hud';

const TARGET_ORDER: readonly ViewInvalidationTarget[] = [
  'canvas',
  'navigator',
  'inspector',
  'toolbar',
  'hud',
];

export interface ViewInvalidationBatch {
  fromRevision: number;
  toRevision: number;
  targets: readonly ViewInvalidationTarget[];
  labels: readonly string[];
}

export type ViewInvalidationListener = (
  batch: ViewInvalidationBatch,
) => void;

export type ViewInvalidationScheduler = (
  callback: () => void,
) => void;

function add(
  targets: Set<ViewInvalidationTarget>,
  ...items: ViewInvalidationTarget[]
): void {
  items.forEach((item) => targets.add(item));
}

export function deriveViewInvalidations(
  event: StoreChangeEvent,
): ViewInvalidationTarget[] {
  const targets = new Set<ViewInvalidationTarget>();

  if (event.changed.project) {
    add(targets, 'canvas', 'navigator', 'inspector', 'toolbar');
  }

  if (event.changed.preferences) {
    add(
      targets,
      'canvas',
      'navigator',
      'inspector',
      'toolbar',
      'hud',
    );
  }

  if (event.changed.session) {
    const previous = event.previous.session;
    const current = event.current.session;
    const contextChanged =
      previous.activeLayoutId !== current.activeLayoutId ||
      previous.workspace !== current.workspace;

    if (contextChanged) {
      add(
        targets,
        'canvas',
        'navigator',
        'inspector',
        'toolbar',
        'hud',
      );
    } else {
      if (previous.selection !== current.selection) {
        add(targets, 'canvas', 'navigator', 'inspector', 'toolbar');
      }

      if (previous.interaction !== current.interaction) {
        add(
          targets,
          'canvas',
          'navigator',
          'inspector',
          'toolbar',
          'hud',
        );
      }

      if (previous.transient !== current.transient) {
        add(targets, 'canvas', 'inspector', 'hud');
      }
    }
  }

  return TARGET_ORDER.filter((target) => targets.has(target));
}

function defaultScheduler(callback: () => void): void {
  queueMicrotask(callback);
}

export class ViewInvalidationCoordinator {
  private unsubscribeStore: (() => void) | null = null;
  private readonly listeners = new Set<ViewInvalidationListener>();
  private readonly pendingTargets = new Set<ViewInvalidationTarget>();
  private pendingFromRevision: number | null = null;
  private pendingToRevision: number | null = null;
  private pendingLabels: string[] = [];
  private queued = false;

  constructor(
    private readonly store: AppStore,
    private readonly scheduler: ViewInvalidationScheduler = defaultScheduler,
  ) {}

  start(): void {
    if (this.unsubscribeStore) return;
    this.unsubscribeStore = this.store.subscribe((event) => {
      this.handleStoreEvent(event);
    });
  }

  stop(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.clearPending();
  }

  subscribe(listener: ViewInvalidationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  flush(): ViewInvalidationBatch | null {
    if (
      this.pendingFromRevision === null ||
      this.pendingToRevision === null ||
      this.pendingTargets.size === 0
    ) {
      this.clearPending();
      return null;
    }

    const batch: ViewInvalidationBatch = {
      fromRevision: this.pendingFromRevision,
      toRevision: this.pendingToRevision,
      targets: TARGET_ORDER.filter((target) =>
        this.pendingTargets.has(target),
      ),
      labels: [...this.pendingLabels],
    };

    this.clearPending();
    this.listeners.forEach((listener) => listener(batch));
    return batch;
  }

  private handleStoreEvent(event: StoreChangeEvent): void {
    const targets = deriveViewInvalidations(event);
    if (targets.length === 0) return;

    targets.forEach((target) => this.pendingTargets.add(target));
    this.pendingFromRevision ??= event.revision;
    this.pendingToRevision = event.revision;

    if (!this.pendingLabels.includes(event.label)) {
      this.pendingLabels.push(event.label);
    }

    if (this.queued) return;
    this.queued = true;
    this.scheduler(() => {
      this.queued = false;
      if (this.unsubscribeStore) this.flush();
      else this.clearPending();
    });
  }

  private clearPending(): void {
    this.pendingTargets.clear();
    this.pendingFromRevision = null;
    this.pendingToRevision = null;
    this.pendingLabels = [];
  }
}
