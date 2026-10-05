import './browser/production-menu-parity';
import './browser/production-navigator-parity';
import './browser/production-rail-resize';
import './styles/index.css';
import './styles/production-shell.css';
import './styles/production-inspector.css';
import './styles/production-inspector-accordion.css';
import './styles/production-piece-properties.css';
import './styles/production-piece-interaction-parity.css';
import './styles/production-splash.css';
import './styles/production-radius.css';
import './styles/production-edge-painter.css';
import './styles/production-mode-hud.css';
import './styles/production-viewport.css';
import './styles/floor-plan-preparation.css';
import './styles/materials.css';
import './styles/scratchpad.css';
import './styles/startup-recovery.css';
import './styles/production-focus.css';
import './styles/production-v159-parity.css';
import './styles/production-navigator-v159-parity.css';
import './styles/smoke-menu-hover.css';

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
export * from './domain/materials';
export * from './domain/scratchpad';
export * from './domain/annotations';
export * from './domain/floor-plans';
export * from './domain/room-features';
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
