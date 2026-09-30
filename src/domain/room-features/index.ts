import { clamp, normalizeDegrees, round3 } from '../../core/numeric';
import { cloneJson, isJsonObject, type JsonObject } from '../types';

export type RoomFeatureCategory =
  | 'cabinet'
  | 'filler-panel'
  | 'appliance'
  | 'wall'
  | 'legacy-run'
  | 'other';

export type RoomWallType = 'full' | 'knee' | 'linked' | null;

export type RoomFeature = JsonObject & {
  id: string;
  kind: string;
  featureType: string;
  name: string;
  x: number;
  y: number;
  length: number;
  depth: number;
  rotation: number;
  visible: boolean;
  receivesCountertop: boolean;
  groupId: string | null;
  wallType: RoomWallType;
  height: number | null;
};

export type RoomFeaturePatch = Partial<
  Pick<
    RoomFeature,
    | 'kind'
    | 'featureType'
    | 'name'
    | 'x'
    | 'y'
    | 'length'
    | 'depth'
    | 'rotation'
    | 'visible'
    | 'receivesCountertop'
    | 'groupId'
    | 'wallType'
    | 'height'
  >
>;

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function nullablePositive(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, round3(number)) : null;
}

function wallType(value: unknown, kind: string, featureType: string): RoomWallType {
  const text = stringValue(value).trim().toLowerCase();
  if (text === 'full' || text === 'knee' || text === 'linked') return text;

  const combined = (kind + ' ' + featureType).toLowerCase();
  if (!combined.includes('wall')) return null;
  if (combined.includes('knee')) return 'knee';
  if (combined.includes('link')) return 'linked';
  return 'full';
}

function inferredName(
  source: JsonObject,
  kind: string,
  featureType: string,
  index: number,
): string {
  const direct =
    stringValue(source.name).trim() ||
    stringValue(source.label).trim() ||
    stringValue(source.title).trim();
  if (direct) return direct;

  const type = featureType || kind;
  if (type) {
    return type
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return `Room Feature ${index + 1}`;
}

export function roomFeatureCategory(
  feature: Pick<RoomFeature, 'kind' | 'featureType' | 'wallType'>,
): RoomFeatureCategory {
  const combined = (
    feature.kind +
    ' ' +
    feature.featureType +
    ' ' +
    (feature.wallType ?? '')
  ).toLowerCase();

  if (
    feature.wallType ||
    combined.includes('wall')
  ) {
    return 'wall';
  }
  if (
    combined.includes('legacy') ||
    combined.includes('run')
  ) {
    return 'legacy-run';
  }
  if (
    combined.includes('filler') ||
    combined.includes('panel')
  ) {
    return 'filler-panel';
  }
  if (
    combined.includes('appliance') ||
    combined.includes('range') ||
    combined.includes('oven') ||
    combined.includes('cooktop') ||
    combined.includes('dishwasher') ||
    combined.includes('refrigerator') ||
    combined.includes('fridge')
  ) {
    return 'appliance';
  }
  if (
    combined.includes('base') ||
    combined.includes('cabinet') ||
    combined.includes('vanity') ||
    combined.includes('upper') ||
    combined.includes('tall')
  ) {
    return 'cabinet';
  }
  return 'other';
}

export function normalizeRoomFeature(
  raw: unknown,
  index = 0,
  idPrefix = 'room-feature',
): RoomFeature {
  const source = isJsonObject(raw) ? cloneJson(raw) : {};
  const kind = stringValue(source.kind, 'feature').trim() || 'feature';
  const featureType =
    stringValue(source.featureType).trim() ||
    stringValue(source.type).trim() ||
    (kind === 'wall' ? 'wall' : 'base');
  const id = stringValue(source.id).trim() || `migrated-${idPrefix}-${index + 1}`;
  const groupId = stringValue(source.groupId).trim() || null;
  const normalizedWallType = wallType(
    source.wallType ?? source.wallKind,
    kind,
    featureType,
  );
  const category = roomFeatureCategory({
    kind,
    featureType,
    wallType: normalizedWallType,
  });

  return {
    ...source,
    id,
    kind,
    featureType,
    name: inferredName(source, kind, featureType, index),
    x: round3(finiteNumber(source.x, 0)),
    y: round3(finiteNumber(source.y, 0)),
    length: Math.max(
      0.25,
      round3(
        finiteNumber(
          source.length ?? source.w ?? source.width,
          category === 'wall' ? 96 : 36,
        ),
      ),
    ),
    depth: Math.max(
      0.25,
      round3(
        finiteNumber(
          source.depth ?? source.h ?? source.height,
          category === 'wall' ? 4 : 24,
        ),
      ),
    ),
    rotation: round3(normalizeDegrees(source.rotation)),
    visible: booleanValue(source.visible, true),
    receivesCountertop: booleanValue(
      source.receivesCountertop ?? source.countertop,
      category === 'cabinet' || category === 'legacy-run',
    ),
    groupId,
    wallType: normalizedWallType,
    height: nullablePositive(source.wallHeight ?? source.heightIn ?? source.height),
  };
}

export function normalizeRoomFeatures(
  raw: unknown,
  idPrefix = 'room-feature',
): RoomFeature[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) =>
    normalizeRoomFeature(item, index, idPrefix),
  );
}

export function createRoomFeature(
  id: string,
  featureType = 'base',
  overrides: RoomFeaturePatch = {},
): RoomFeature {
  return normalizeRoomFeature({
    id,
    kind: overrides.kind ?? (featureType.includes('wall') ? 'wall' : 'feature'),
    featureType,
    name: overrides.name ?? '',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    length: overrides.length ?? (featureType.includes('wall') ? 96 : 36),
    depth: overrides.depth ?? (featureType.includes('wall') ? 4 : 24),
    rotation: overrides.rotation ?? 0,
    visible: overrides.visible ?? true,
    receivesCountertop: overrides.receivesCountertop,
    groupId: overrides.groupId ?? null,
    wallType: overrides.wallType,
    height: overrides.height,
  });
}

export function roomFeatureOpacity(
  preference: number,
): number {
  return clamp(preference, 0, 1);
}
