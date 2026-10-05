import {
  CLIPPER_TOPOLOGY_VERSION,
  clipperPolygonBoolean,
  clipperPolygonOffset,
} from './clipper-topology';
import { flattenGeometryKernel } from './flatten-kernel';
import type { GeometryKernel, GeometryKernelInfo } from './kernel';

/**
 * Active CAD Lite computational geometry engine.
 *
 * Flatten.js handles analytical geometry while Clipper handles robust polygon
 * topology. Both engines stay behind this one CAD Lite-owned boundary so
 * domain/browser code never depends on either third-party representation.
 */
export const geometryKernel: GeometryKernel = {
  ...flattenGeometryKernel,
  id: 'flatten-js+clipper',
  version: `flatten-js@${flattenGeometryKernel.version}+js-angusj-clipper@${CLIPPER_TOPOLOGY_VERSION}`,
  polygonBoolean: clipperPolygonBoolean,
  polygonOffset: clipperPolygonOffset,
};

export const geometryKernelInfo: GeometryKernelInfo = Object.freeze({
  id: geometryKernel.id,
  version: geometryKernel.version,
});
