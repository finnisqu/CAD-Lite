import { clamp, normalizeDegrees, round3 } from '../../core/numeric';
import { cloneJson, isJsonObject, type JsonObject } from '../types';

export type FloorPlanCalibration = JsonObject | null;

export type FloorPlan = JsonObject & {
  id: string;
  name: string;
  dataURL: string;
  natW: number;
  natH: number;
  w: number;
  h: number;
  opacity: number;
  visible: boolean;
  grayscale: boolean;
  flipX: boolean;
  flipY: boolean;
  rotation: number;
  calibrated: boolean;
  calibration: FloorPlanCalibration;
  locked: boolean;
  includeInExport: boolean;
  margin: number;
  offsetX: number;
  offsetY: number;
};

export type FloorPlanPatch = Partial<
  Pick<
    FloorPlan,
    | 'name'
    | 'dataURL'
    | 'natW'
    | 'natH'
    | 'w'
    | 'h'
    | 'opacity'
    | 'visible'
    | 'grayscale'
    | 'flipX'
    | 'flipY'
    | 'rotation'
    | 'calibrated'
    | 'calibration'
    | 'locked'
    | 'includeInExport'
    | 'margin'
    | 'offsetX'
    | 'offsetY'
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

function nonNegative(value: unknown, fallback = 0): number {
  return Math.max(0, round3(finiteNumber(value, fallback)));
}

export function normalizeFloorPlan(
  raw: unknown,
  index = 0,
  idPrefix = 'floor-plan',
): FloorPlan | null {
  if (!isJsonObject(raw)) return null;
  const source = cloneJson(raw);
  const calibrated = booleanValue(source.calibrated, false);
  const calibration = isJsonObject(source.calibration)
    ? cloneJson(source.calibration)
    : null;

  return {
    ...source,
    id:
      stringValue(source.id).trim() ||
      `migrated-${idPrefix}-${index + 1}`,
    name: stringValue(source.name).trim() || 'Floor Plan',
    dataURL: stringValue(source.dataURL),
    natW: nonNegative(source.natW),
    natH: nonNegative(source.natH),
    w: Math.max(1, round3(finiteNumber(source.w, 300))),
    h: Math.max(1, round3(finiteNumber(source.h, 200))),
    opacity: clamp(finiteNumber(source.opacity, 0.4), 0.08, 1),
    visible: booleanValue(source.visible, true),
    grayscale: booleanValue(source.grayscale, false),
    flipX: booleanValue(source.flipX, false),
    flipY: booleanValue(source.flipY, false),
    rotation: normalizeDegrees(source.rotation),
    calibrated,
    calibration,
    locked: booleanValue(source.locked, calibrated),
    includeInExport: booleanValue(source.includeInExport, false),
    margin: nonNegative(source.margin),
    offsetX: round3(finiteNumber(source.offsetX, 0)),
    offsetY: round3(finiteNumber(source.offsetY, 0)),
  };
}

export interface CreateFloorPlanInput {
  id: string;
  name?: string;
  dataURL: string;
  natW: number;
  natH: number;
  w?: number;
  h?: number;
}

export function createFloorPlan(input: CreateFloorPlanInput): FloorPlan {
  const aspect =
    input.natW > 0 && input.natH > 0
      ? input.natW / input.natH
      : 1.5;
  let w = input.w ?? (aspect >= 1 ? 300 : 300 * aspect);
  let h = input.h ?? (aspect >= 1 ? 300 / aspect : 300);
  w = Math.max(12, w);
  h = Math.max(12, h);

  return normalizeFloorPlan({
    id: input.id,
    name: input.name ?? 'Floor Plan',
    dataURL: input.dataURL,
    natW: input.natW,
    natH: input.natH,
    w,
    h,
    opacity: 0.4,
    visible: true,
    grayscale: false,
    flipX: false,
    flipY: false,
    rotation: 0,
    calibrated: false,
    calibration: null,
    locked: false,
    includeInExport: false,
    margin: 6,
    offsetX: 0,
    offsetY: 0,
  })!;
}

export interface FloorPlanCanvasSize {
  w: number;
  h: number;
}

export function floorPlanCanvasSize(plan: FloorPlan): FloorPlanCanvasSize {
  const radians = plan.rotation * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return {
    w: Math.max(
      12,
      round3(plan.w * cosine + plan.h * sine + plan.margin * 2),
    ),
    h: Math.max(
      12,
      round3(plan.w * sine + plan.h * cosine + plan.margin * 2),
    ),
  };
}

export function calibrateFloorPlan(
  plan: FloorPlan,
  measuredDistance: number,
  knownDistance: number,
  updatedAt = new Date().toISOString(),
): FloorPlan {
  if (!(measuredDistance > 0.0001) || !(knownDistance > 0)) return plan;
  const factor = knownDistance / measuredDistance;
  return normalizeFloorPlan({
    ...plan,
    w: plan.w * factor,
    h: plan.h * factor,
    calibrated: true,
    locked: true,
    calibration: {
      knownDistance,
      measuredDistance,
      factor,
      updatedAt,
    },
  })!;
}
