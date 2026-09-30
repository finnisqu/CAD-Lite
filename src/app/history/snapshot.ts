import type { ProjectState } from '../../domain/project';
import type { Workspace } from '../../persistence';
import { resetActiveInteraction } from '../interaction/state';
import { normalizeSelection } from '../selection';
import type {
  ApplicationState,
  ReadonlyApplicationState,
  Selection,
} from '../state';

export interface HistorySnapshot {
  project: ProjectState;
  workspace: Workspace;
  activeLayoutId: string | null;
  fallbackSelection: Selection;
}

function cloneProject(project: ProjectState): ProjectState {
  return JSON.parse(JSON.stringify(project)) as ProjectState;
}

function cloneSelection(selection: Selection): Selection {
  if (selection.kind === 'none') return { kind: 'none' };
  if (selection.kind === 'pieces') {
    return { kind: 'pieces', ids: [...selection.ids] };
  }
  return { ...selection };
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
    project: cloneProject(state.project),
    workspace: state.session.workspace,
    activeLayoutId: state.session.activeLayoutId,
    fallbackSelection: cloneSelection(state.session.selection),
  };
}

export function historySnapshotSignature(snapshot: HistorySnapshot): string {
  return JSON.stringify({
    project: snapshot.project,
    workspace: snapshot.workspace,
  });
}

export function restoreHistorySnapshot(
  current: ReadonlyApplicationState,
  snapshot: HistorySnapshot,
): ApplicationState {
  const project = cloneProject(snapshot.project);
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
