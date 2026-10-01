import { clampPiecePoseToWorkspace, pieceGeometry, piecePose } from '../../domain/pieces';
import type { Layout } from '../../domain/project';
import type { AppCommand } from './types';

export const MIN_CANVAS_DIMENSION = 12;
export const MIN_CANVAS_SCALE = 1;
export const MAX_CANVAS_SCALE = 24;
export const MIN_GRID_SIZE = 0.25;

export interface LayoutViewportPatch {
  width?: number;
  height?: number;
  scale?: number;
  grid?: number;
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum = Number.POSITIVE_INFINITY): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function applyViewportPatch(
  layout: Layout,
  patch: LayoutViewportPatch,
): Layout {
  const width =
    patch.width === undefined || layout.plan
      ? layout.cw
      : clamp(finite(patch.width, layout.cw), MIN_CANVAS_DIMENSION);
  const height =
    patch.height === undefined || layout.plan
      ? layout.ch
      : clamp(finite(patch.height, layout.ch), MIN_CANVAS_DIMENSION);
  const scale =
    patch.scale === undefined
      ? layout.scale
      : clamp(
          finite(patch.scale, layout.scale),
          MIN_CANVAS_SCALE,
          MAX_CANVAS_SCALE,
        );
  const grid =
    patch.grid === undefined
      ? layout.grid
      : clamp(finite(patch.grid, layout.grid), MIN_GRID_SIZE);

  const canvasChanged = width !== layout.cw || height !== layout.ch;
  if (
    !canvasChanged &&
    scale === layout.scale &&
    grid === layout.grid
  ) {
    return layout;
  }

  let next: Layout = {
    ...layout,
    cw: width,
    ch: height,
    scale,
    grid,
  };

  if (canvasChanged) {
    const pieces = layout.pieces.map((piece) => {
      const pose = clampPiecePoseToWorkspace(
        next,
        'design',
        pieceGeometry(piece),
        piecePose(piece, 'design'),
      );
      if (
        pose.x === piece.x &&
        pose.y === piece.y &&
        pose.rotation === piece.rotation
      ) {
        return piece;
      }
      return {
        ...piece,
        x: pose.x,
        y: pose.y,
        rotation: pose.rotation,
      };
    });
    next = { ...next, pieces };
  }

  return next;
}

export function updateLayoutViewport(
  layoutId: string,
  patch: LayoutViewportPatch,
): AppCommand {
  return {
    type: 'layout.updateViewport',
    label: 'Update canvas view',
    history: 'record',
    persistence: 'save',
    reduce(state) {
      const index = state.project.layouts.findIndex(
        (layout) => layout.id === layoutId,
      );
      const layout = state.project.layouts[index];
      if (index < 0 || !layout) return state;

      const nextLayout = applyViewportPatch(layout, patch);
      if (nextLayout === layout) return state;

      const layouts = [...state.project.layouts];
      layouts[index] = nextLayout;
      return {
        ...state,
        project: {
          ...state.project,
          layouts,
        },
      };
    },
  };
}
