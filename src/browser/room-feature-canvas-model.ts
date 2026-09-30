import type { ReadonlyApplicationState } from '../app/state';
import {
  roomFeatureCategory,
  roomFeatureOpacity,
  type RoomFeature,
  type RoomFeatureCategory,
  type RoomWallType,
} from '../domain/room-features';
import {
  rotateVector,
  roundedRectContainsPoint,
  roundedRectPathCorners,
  type Point,
  type XYWHRect,
} from '../geometry';

export interface RoomFeatureCanvasItem {
  id: string;
  name: string;
  featureType: string;
  category: RoomFeatureCategory;
  wallType: RoomWallType;
  receivesCountertop: boolean;
  selected: boolean;
  x: number;
  y: number;
  length: number;
  depth: number;
  rotation: number;
  center: Point;
  bounds: XYWHRect;
  localRect: XYWHRect;
  path: string;
  opacity: number;
}

export interface RoomFeatureCanvasProjection {
  items: RoomFeatureCanvasItem[];
}

function categoryVisible(
  state: ReadonlyApplicationState,
  category: RoomFeatureCategory,
): boolean {
  if (!state.preferences.showRoomFeatures) return false;

  if (category === 'wall') return state.preferences.showRoomWalls;
  if (category === 'filler-panel') {
    return state.preferences.showRoomFillersPanels;
  }
  if (category === 'appliance') {
    return state.preferences.showRoomAppliances;
  }
  if (category === 'cabinet' || category === 'legacy-run') {
    return state.preferences.showRoomCabinets;
  }
  return true;
}

function rotatedBounds(
  feature: Pick<RoomFeature, 'x' | 'y' | 'length' | 'depth' | 'rotation'>,
): XYWHRect {
  const radians = feature.rotation * Math.PI / 180;
  const width =
    Math.abs(feature.length * Math.cos(radians)) +
    Math.abs(feature.depth * Math.sin(radians));
  const height =
    Math.abs(feature.length * Math.sin(radians)) +
    Math.abs(feature.depth * Math.cos(radians));
  const center = {
    x: feature.x + feature.length / 2,
    y: feature.y + feature.depth / 2,
  };
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    w: width,
    h: height,
  };
}

export function projectRoomFeatureForCanvas(
  feature: RoomFeature,
  selected: boolean,
  opacity: number,
): RoomFeatureCanvasItem {
  const center = {
    x: feature.x + feature.length / 2,
    y: feature.y + feature.depth / 2,
  };
  const localRect = {
    x: feature.x,
    y: feature.y,
    w: feature.length,
    h: feature.depth,
  };
  const category = roomFeatureCategory(feature);
  const corner = category === 'wall' ? 0 : Math.min(1.5, feature.depth / 6);

  return {
    id: feature.id,
    name: feature.name,
    featureType: feature.featureType,
    category,
    wallType: feature.wallType,
    receivesCountertop: feature.receivesCountertop,
    selected,
    x: feature.x,
    y: feature.y,
    length: feature.length,
    depth: feature.depth,
    rotation: feature.rotation,
    center,
    bounds: rotatedBounds(feature),
    localRect,
    path: roundedRectPathCorners(localRect, {
      tl: corner,
      tr: corner,
      br: corner,
      bl: corner,
    }),
    opacity: roomFeatureOpacity(opacity),
  };
}

export function createRoomFeatureCanvasProjection(
  state: ReadonlyApplicationState,
): RoomFeatureCanvasProjection {
  const layout = state.project.layouts.find(
    (item) => item.id === state.session.activeLayoutId,
  );
  if (!layout || state.session.workspace !== 'design') {
    return { items: [] };
  }

  const selection = state.session.selection;
  return {
    items: layout.roomFeatures
      .filter(
        (feature) =>
          feature.visible &&
          categoryVisible(state, roomFeatureCategory(feature)),
      )
      .map((feature) =>
        projectRoomFeatureForCanvas(
          feature,
          selection.kind === 'roomFeature' &&
            selection.id === feature.id,
          state.preferences.roomFeatureOpacity,
        ),
      ),
  };
}

export function hitTestRoomFeatures(
  projection: RoomFeatureCanvasProjection,
  point: Point,
): RoomFeatureCanvasItem | null {
  for (let index = projection.items.length - 1; index >= 0; index -= 1) {
    const item = projection.items[index];
    if (!item) continue;
    if (
      point.x < item.bounds.x ||
      point.x > item.bounds.x + item.bounds.w ||
      point.y < item.bounds.y ||
      point.y > item.bounds.y + item.bounds.h
    ) {
      continue;
    }

    const offset = rotateVector(
      point.x - item.center.x,
      point.y - item.center.y,
      -item.rotation,
    );
    const local = {
      x: item.center.x + offset.x,
      y: item.center.y + offset.y,
    };

    if (
      roundedRectContainsPoint(
        item.localRect,
        { tl: 0, tr: 0, br: 0, bl: 0 },
        local,
      )
    ) {
      return item;
    }
  }
  return null;
}
