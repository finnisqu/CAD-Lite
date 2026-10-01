import type { CanvasNote, DimensionAnnotation, DrawingLine } from '../annotations';
import type { FloorPlan } from '../floor-plans';
import type { Piece } from '../pieces/types';
import type { RoomFeature } from '../room-features';
import type { SlabSurface } from '../slabs';
import type { EntityId, JsonObject, JsonValue } from '../types';

export interface ProjectMeta {
  name: string;
  date: string;
  notes: string;
  scratchpad: JsonValue;
}

export interface Material {
  id: EntityId;
  name: string;
  category: string;
  manufacturer: string;
  finish: string;
  thicknessCm: number;
  defaultSlabW: number;
  defaultSlabH: number;
}

export interface Area {
  id: EntityId;
  name: string;
}

export interface PersistedEntity extends JsonObject {
  id: JsonValue;
}

export interface Layout {
  id: EntityId;
  name: string;
  quantity: number;
  cw: number;
  ch: number;
  scale: number;
  grid: number;
  showGrid: boolean;
  pieceFillOpacity: number;
  areas: Area[];
  activeAreaId: EntityId;
  pieces: Piece[];
  dims: DimensionAnnotation[];
  notes: CanvasNote[];
  lines: DrawingLine[];
  roomFeatures: RoomFeature[];
  plan: FloorPlan | null;
  overlays: SlabSurface[];
  extra: JsonObject;
}

export interface ProjectState {
  meta: ProjectMeta;
  materials: Material[];
  layouts: Layout[];
}
