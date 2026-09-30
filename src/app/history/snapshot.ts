import type {
  Material,
  ProjectState,
} from '../../domain/project';
import type { Layout } from '../../domain/project';
import type { Workspace } from '../../persistence';
import { resetActiveInteraction } from '../interaction/state';
import { normalizeSelection } from '../selection';
import type {
  ApplicationState,
  ReadonlyApplicationState,
  Selection,
} from '../state';

export interface HistorySnapshot {
  materials: Material[];
  layouts: Layout[];
  workspace: Workspace;
  activeLayoutId: string | null;
  fallbackSelection: Selection;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneSelection(selection: Selection): Selection {
  if (selection.kind === 'none') return { kind: 'none' };
  if (selection.kind === 'pieces') {
    return { kind: 'pieces', ids: [...selection.ids] };
  }
  return { ...selection };
}

function projectFromSnapshot(
  current: ProjectState,
  snapshot: HistorySnapshot,
): ProjectState {
  return {
    ...current,
    materials: cloneValue(snapshot.materials),
    layouts: cloneValue(snapshot.layouts).map(layout => {
      const currentArea = current.layouts.find(item => item.id === layout.id)?.activeAreaId;
      return currentArea && layout.areas.some(area => area.id === currentArea)
        ? { ...layout, activeAreaId: currentArea } : layout;
    }),
  };
}

function resolveActiveLayoutId(
  project: ProjectState,
  currentId: string | null,
  fallbackId: string | null,
): string | null {
  if (
    currentId &&
    project.layouts.some((layout) => layout.id === currentId)
  ) {
    return currentId;
  }

  if (
    fallbackId &&
    project.layouts.some((layout) => layout.id === fallbackId)
  ) {
    return fallbackId;
  }

  return project.layouts[0]?.id ?? null;
}

export function captureHistorySnapshot(
  state: ReadonlyApplicationState,
): HistorySnapshot {
  return {
    materials: cloneValue(state.project.materials),
    layouts: cloneValue(state.project.layouts),
    workspace: state.session.workspace,
    activeLayoutId: state.session.activeLayoutId,
    fallbackSelection: cloneSelection(state.session.selection),
  };
}

export function historySnapshotSignature(snapshot: HistorySnapshot): string {
  return JSON.stringify({
    materials: snapshot.materials,
    layouts: snapshot.layouts.map(layout => ({ ...layout, activeAreaId: null })),
    workspace: snapshot.workspace,
  });
}

export function restoreHistorySnapshot(
  current: ReadonlyApplicationState,
  snapshot: HistorySnapshot,
): ApplicationState {
  const project = projectFromSnapshot(current.project, snapshot);
  const activeLayoutId = resolveActiveLayoutId(
    project,
    current.session.activeLayoutId,
    snapshot.activeLayoutId,
  );
  const workspace = snapshot.workspace;
  const contextChanged =
    activeLayoutId !== current.session.activeLayoutId ||
    workspace !== current.session.workspace;

  const base: ApplicationState = {
    project,
    preferences: current.preferences,
    session: {
      ...current.session,
      activeLayoutId,
      workspace,
      selection: { kind: 'none' },
      interaction: contextChanged
        ? resetActiveInteraction(current.session.interaction)
        : current.session.interaction,
      transient: contextChanged ? {} : current.session.transient,
    },
  };

  const currentCandidate: Selection =
    workspace !== current.session.workspace &&
    current.session.selection.kind !== 'pieces'
      ? { kind: 'none' }
      : current.session.selection;
  const currentSelection = normalizeSelection(base, currentCandidate);
  const fallbackSelection = normalizeSelection(
    base,
    snapshot.fallbackSelection,
  );

  return {
    ...base,
    session: {
      ...base.session,
      selection:
        currentSelection.kind !== 'none'
          ? currentSelection
          : fallbackSelection,
    },
  };
}
