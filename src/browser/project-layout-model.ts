import type {
  AutosaveStatus,
  HistoryStatus,
  ReadonlyApplicationState,
} from '../app';

export interface ProjectLayoutRowModel {
  id: string;
  name: string;
  quantity: number;
  active: boolean;
  selected: boolean;
}

export interface SelectedLayoutModel {
  id: string;
  name: string;
  quantity: number;
  areaCount: number;
  pieceCount: number;
}

export interface ProjectLayoutViewModel {
  project: {
    name: string;
    date: string;
    notes: string;
  };
  layouts: ProjectLayoutRowModel[];
  selectedLayout: SelectedLayoutModel | null;
  history: HistoryStatus;
  autosave: AutosaveStatus;
}

export function createProjectLayoutViewModel(
  state: ReadonlyApplicationState,
  history: HistoryStatus,
  autosave: AutosaveStatus,
): ProjectLayoutViewModel {
  const selectedLayoutId =
    state.session.selection.kind === 'layout'
      ? state.session.selection.id
      : null;
  const selectedLayout = selectedLayoutId
    ? state.project.layouts.find(
        (layout) => layout.id === selectedLayoutId,
      ) ?? null
    : null;

  return {
    project: {
      name: state.project.meta.name,
      date: state.project.meta.date,
      notes: state.project.meta.notes,
    },
    layouts: state.project.layouts.map((layout) => ({
      id: layout.id,
      name: layout.name,
      quantity: layout.quantity,
      active: layout.id === state.session.activeLayoutId,
      selected: layout.id === selectedLayoutId,
    })),
    selectedLayout: selectedLayout
      ? {
          id: selectedLayout.id,
          name: selectedLayout.name,
          quantity: selectedLayout.quantity,
          areaCount: selectedLayout.areas.length,
          pieceCount: selectedLayout.pieces.length,
        }
      : null,
    history,
    autosave,
  };
}
