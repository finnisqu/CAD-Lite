import type { JsonObject } from '../domain/types';
import {
  CAD_LITE_SCHEMA_VERSION,
  migrateCadLiteFile,
  normalizeCanonicalFile,
  type CadLiteFile,
} from '../persistence';
import {
  emptySelection,
  type ApplicationState,
} from './state';

export function applicationStateFromCadLiteFile(file: CadLiteFile): ApplicationState {
  const normalized = normalizeCanonicalFile(file);

  return {
    project: normalized.project,
    session: {
      activeLayoutId: normalized.editor.activeLayoutId,
      workspace: normalized.editor.workspace,
      selection: emptySelection(),
      transient: {},
    },
    preferences: normalized.editor.preferences,
  };
}

export function applicationStateFromLegacyPayload(payload: unknown): ApplicationState {
  return applicationStateFromCadLiteFile(migrateCadLiteFile(payload));
}

export function cadLiteFileFromApplicationState(
  state: ApplicationState,
  appVersion = '1.6.0-dev.0',
): CadLiteFile {
  return normalizeCanonicalFile({
    schemaVersion: CAD_LITE_SCHEMA_VERSION,
    appVersion,
    project: state.project,
    editor: {
      activeLayoutId: state.session.activeLayoutId,
      workspace: state.session.workspace,
      preferences: state.preferences,
    },
  });
}

export interface LegacyRuntimeBridge {
  read(): JsonObject;
  write(payload: JsonObject): void;
}

/**
 * Temporary integration seam for the future v1.5.99 runtime migration.
 *
 * Batch 5 defines the contract only. No production runtime is wired to it yet.
 */
export function createLegacyRuntimeBridge(
  read: () => JsonObject,
  write: (payload: JsonObject) => void,
): LegacyRuntimeBridge {
  return { read, write };
}
