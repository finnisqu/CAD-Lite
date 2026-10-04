import {
  CAD_LITE_SCHEMA_VERSION,
  migrateCadLiteFile,
  normalizeCanonicalFile,
  type CadLiteFile,
} from '../persistence';
import { createDefaultInteractionState } from './interaction';
import {
  emptySelection,
  type ApplicationState,
  type ReadonlyApplicationState,
} from './state';

export function applicationStateFromCadLiteFile(file: CadLiteFile): ApplicationState {
  const normalized = normalizeCanonicalFile(file);

  return {
    project: normalized.project,
    session: {
      activeLayoutId: normalized.editor.activeLayoutId,
      workspace: normalized.editor.workspace,
      selection: emptySelection(),
      interaction: createDefaultInteractionState(),
      transient: {},
    },
    preferences: normalized.editor.preferences,
  };
}

export function applicationStateFromLegacyPayload(payload: unknown): ApplicationState {
  return applicationStateFromCadLiteFile(migrateCadLiteFile(payload));
}

export function cadLiteFileFromApplicationState(
  state: ReadonlyApplicationState,
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
