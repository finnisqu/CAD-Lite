import type {
  ApplicationState,
  ReadonlyApplicationState,
} from './state';

export type HistoryPolicy = 'record' | 'skip';
export type PersistencePolicy = 'save' | 'skip';
export type CommitKind = 'command' | 'transaction' | 'system';

export interface ChangedDomains {
  project: boolean;
  session: boolean;
  preferences: boolean;
}

export interface StoreCommitMetadata {
  kind: CommitKind;
  label: string;
  commandTypes: string[];
  history: HistoryPolicy;
  persistence: PersistencePolicy;
}

export interface StoreChangeEvent extends StoreCommitMetadata {
  revision: number;
  changed: ChangedDomains;
  previous: ReadonlyApplicationState;
  current: ReadonlyApplicationState;
}

export type StoreListener = (event: StoreChangeEvent) => void;

function changedDomains(
  previous: ReadonlyApplicationState,
  current: ReadonlyApplicationState,
): ChangedDomains {
  return {
    project: previous.project !== current.project,
    session: previous.session !== current.session,
    preferences: previous.preferences !== current.preferences,
  };
}

function hasChanges(changed: ChangedDomains): boolean {
  return changed.project || changed.session || changed.preferences;
}

function withActiveLayoutInvariant(state: ApplicationState): ApplicationState {
  const currentId = state.session.activeLayoutId;
  const activeExists =
    currentId !== null &&
    state.project.layouts.some((layout) => layout.id === currentId);
  if (activeExists || state.project.layouts.length === 0) return state;

  const fallback = state.project.layouts[0];
  if (!fallback) return state;
  return {
    ...state,
    session: {
      ...state.session,
      activeLayoutId: fallback.id,
    },
  };
}

export class AppStore {
  private state: ApplicationState;
  private revision = 0;
  private readonly listeners = new Set<StoreListener>();

  constructor(initialState: ApplicationState) {
    this.state = withActiveLayoutInvariant(initialState);
  }

  getState(): ReadonlyApplicationState {
    return this.state;
  }

  getRevision(): number {
    return this.revision;
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  commit(
    nextState: ApplicationState,
    metadata: StoreCommitMetadata,
  ): StoreChangeEvent | null {
    const previous = this.state;
    const reconciled = withActiveLayoutInvariant(nextState);
    const changed = changedDomains(previous, reconciled);

    if (!hasChanges(changed)) return null;

    this.state = reconciled;
    this.revision += 1;

    const event: StoreChangeEvent = {
      ...metadata,
      revision: this.revision,
      changed,
      previous,
      current: reconciled,
    };

    this.listeners.forEach((listener) => listener(event));
    return event;
  }

  replaceState(
    nextState: ApplicationState,
    label = 'Replace application state',
  ): StoreChangeEvent | null {
    return this.commit(nextState, {
      kind: 'system',
      label,
      commandTypes: [],
      history: 'skip',
      persistence: 'skip',
    });
  }
}
