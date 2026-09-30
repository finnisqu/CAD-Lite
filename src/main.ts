import './styles/index.css';

export {
  CAD_LITE_ARCHITECTURE_VERSION,
  CAD_LITE_BEHAVIOR_BASELINE,
  getBuildInfo,
} from './app/build-info';

export type { BuildInfo } from './app/build-info';

export * from './app';
export * from './browser';
export * from './core/numeric';
export * from './domain/project';
export * from './domain/annotations';
export * from './domain/slabs';
export type {
  EntityId,
  JsonObject,
  JsonPrimitive,
  JsonValue,
} from './domain/types';
export * from './geometry';
export * from './persistence';

export * from './domain/pieces';
