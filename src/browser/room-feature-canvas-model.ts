import type { ReadonlyApplicationState } from '../app/state';
import {
  createRoomFeature,
  normalizeRoomFeature,
  roomFeatureCategory,
  roomFeatureOpacity,
  type RoomFeature,
  type RoomFeatureCategory,
  type RoomWallType,
} from '../domain/room-features';
import {
  rotatePointAround,
  rotatedRectBounds,
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
  preview: boolean;
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

export function projectRoomFeatureForCanvas(
  feature: RoomFeature,
  selected: boolean,
  opacity: number,
  preview = false,
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
    preview,
    x: feature.x,
    y: feature.y,
    length: feature.length,
    depth: feature.depth,
    rotation: feature.rotation,
    center,
    bounds: rotatedRectBounds(localRect, feature.rotation),
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

function interactionRecord(
  state: ReadonlyApplicationState,
): Record<string, unknown> | null {
  const raw = state.session.interaction.preview;
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') return null;
  return raw as Record<string, unknown>;
}

function previewNumber(
  record: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : fallback;
}

function createInteractionFeature(
  state: ReadonlyApplicationState,
): RoomFeature | null {
  const record = interactionRecord(state);
  if (!record || record.kind !== 'room-feature-create') return null;
  const tool = record.tool;
  if (
    tool !== 'roomFeatures' &&
    tool !== 'roomWall' &&
    tool !== 'linkedWall'
  ) {
    return null;
  }

  const wall = tool !== 'roomFeatures';
  return createRoomFeature(
    '__room-feature-preview__',
    wall
      ? tool === 'linkedWall'
        ? 'linked-wall'
        : 'wall'
      : 'base',
    {
      kind: wall ? 'wall' : 'feature',
      name: wall
        ? tool === 'linkedWall'
          ? 'Linked Wall'
          : 'Wall'
        : 'Base Cabinet',
      x: previewNumber(record, 'x', 0),
      y: previewNumber(record, 'y', 0),
      length: previewNumber(record, 'length', wall ? 96 : 36),
      depth: previewNumber(record, 'depth', wall ? 4 : 24),
      rotation: previewNumber(record, 'rotation', 0),
      wallType: tool === 'linkedWall' ? 'linked' : wall ? 'full' : null,
      receivesCountertop: !wall,
    },
  );
}

function applyInteractionPreview(
  state: ReadonlyApplicationState,
  feature: RoomFeature,
  index: number,
): RoomFeature {
  const record = interactionRecord(state);
  if (!record) return feature;

  if (
    record.kind === 'room-feature-nudge' &&
    Array.isArray(record.ids) &&
    record.ids.includes(feature.id)
  ) {
    return normalizeRoomFeature(
      {
        ...feature,
        x: feature.x + previewNumber(record, 'dx', 0),
        y: feature.y + previewNumber(record, 'dy', 0),
        id: feature.id,
      },
      index,
      'room-feature-preview',
    );
  }

  if (
    record.kind !== 'room-feature-edit' ||
    record.id !== feature.id ||
    !record.patch ||
    Array.isArray(record.patch) ||
    typeof record.patch !== 'object'
  ) {
    return feature;
  }

  return normalizeRoomFeature(
    {
      ...feature,
      ...(record.patch as Record<string, unknown>),
      id: feature.id,
    },
    index,
    'room-feature-preview',
  );
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
  const items = layout.roomFeatures
    .map((feature, index) => applyInteractionPreview(state, feature, index))
    .filter(
      (feature) =>
        feature.visible &&
        categoryVisible(state, roomFeatureCategory(feature)),
    )
    .map((feature) =>
      projectRoomFeatureForCanvas(
        feature,
        selection.kind === 'roomFeature' && selection.id === feature.id,
        state.preferences.roomFeatureOpacity,
      ),
    );

  const preview = createInteractionFeature(state);
  if (
    preview &&
    categoryVisible(state, roomFeatureCategory(preview))
  ) {
    items.push(
      projectRoomFeatureForCanvas(
        preview,
        false,
        Math.max(0.35, state.preferences.roomFeatureOpacity),
        true,
      ),
    );
  }

  return { items };
}

export function hitTestRoomFeatures(
  projection: RoomFeatureCanvasProjection,
  point: Point,
): RoomFeatureCanvasItem | null {
  for (let index = projection.items.length - 1; index >= 0; index -= 1) {
    const item = projection.items[index];
    if (!item || item.preview) continue;
    if (
      point.x < item.bounds.x ||
      point.x > item.bounds.x + item.bounds.w ||
      point.y < item.bounds.y ||
      point.y > item.bounds.y + item.bounds.h
    ) {
      continue;
    }

    const local = rotatePointAround(point, item.center, -item.rotation);

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
