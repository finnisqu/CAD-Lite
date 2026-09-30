import type {
  AutosaveStatus,
  HistoryStatus,
  ReadonlyApplicationState,
} from '../app';
import {
  visiblePieceCountForArea,
} from '../domain/project';

export interface ProjectLayoutRowModel {
  id: string;
  name: string;
  quantity: number;
  active: boolean;
  selected: boolean;
}

export interface AreaRowModel {
  id: string;
  name: string;
  active: boolean;
  selected: boolean;
  pieceCount: number;
}

export interface SelectedLayoutModel {
  id: string;
  name: string;
  quantity: number;
  areaCount: number;
  pieceCount: number;
}

export interface SelectedAreaModel {
  id: string;
  layoutId: string;
  name: string;
  pieceCount: number;
  canDelete: boolean;
}

export interface ProjectLayoutViewModel {
  project: {
    name: string;
    date: string;
    notes: string;
  };
  activeLayoutId: string | null;
  layouts: ProjectLayoutRowModel[];
  areas: AreaRowModel[];
  selectedLayout: SelectedLayoutModel | null;
  selectedArea: SelectedAreaModel | null;
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
  const selectedAreaId =
    state.session.selection.kind === 'area'
      ? state.session.selection.id
      : null;
  const activeLayout =
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null;
  const selectedLayout = selectedLayoutId
    ? state.project.layouts.find(
        (layout) => layout.id === selectedLayoutId,
      ) ?? null
    : null;
  const selectedArea =
    activeLayout && selectedAreaId
      ? activeLayout.areas.find(
          (area) => area.id === selectedAreaId,
        ) ?? null
      : null;

  return {
    project: {
      name: state.project.meta.name,
      date: state.project.meta.date,
      notes: state.project.meta.notes,
    },
    activeLayoutId: activeLayout?.id ?? null,
    layouts: state.project.layouts.map((layout) => ({
      id: layout.id,
      name: layout.name,
      quantity: layout.quantity,
      active: layout.id === state.session.activeLayoutId,
      selected: layout.id === selectedLayoutId,
    })),
    areas: activeLayout
      ? activeLayout.areas.map((area) => ({
          id: area.id,
          name: area.name,
          active: area.id === activeLayout.activeAreaId,
          selected: area.id === selectedAreaId,
          pieceCount: visiblePieceCountForArea(
            activeLayout,
            area.id,
          ),
        }))
      : [],
    selectedLayout: selectedLayout
      ? {
          id: selectedLayout.id,
          name: selectedLayout.name,
          quantity: selectedLayout.quantity,
          areaCount: selectedLayout.areas.length,
          pieceCount: selectedLayout.pieces.length,
        }
      : null,
    selectedArea:
      activeLayout && selectedArea
        ? {
            id: selectedArea.id,
            layoutId: activeLayout.id,
            name: selectedArea.name,
            pieceCount: visiblePieceCountForArea(
              activeLayout,
              selectedArea.id,
            ),
            canDelete: activeLayout.areas.length > 1,
          }
        : null,
    history,
    autosave,
  };
}
