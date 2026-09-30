export interface Point {
  x: number;
  y: number;
}

export interface Axis {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface RotatedSize extends Size {
  rotation?: number;
}

export interface XYWHRect extends Size {
  x: number;
  y: number;
}

export interface EdgeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Projection {
  min: number;
  max: number;
}
