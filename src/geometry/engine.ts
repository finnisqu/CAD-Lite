import { flattenGeometryKernel } from './flatten-kernel';
import type { GeometryKernel, GeometryKernelInfo } from './kernel';

/**
 * Active CAD Lite computational geometry engine.
 *
 * Keeping this binding in one file makes the engine replaceable without
 * changing domain/browser callers or persisted project data.
 */
export const geometryKernel: GeometryKernel = flattenGeometryKernel;

export const geometryKernelInfo: GeometryKernelInfo = Object.freeze({
  id: geometryKernel.id,
  version: geometryKernel.version,
});
