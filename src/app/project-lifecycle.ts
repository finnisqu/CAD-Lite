import { CAD_LITE_ARCHITECTURE_VERSION } from './build-info';
import {
  applicationStateFromCadLiteFile,
  cadLiteFileFromApplicationState,
} from './bridge';
import type { ApplicationEffects } from './effects';
import type { AppStore } from './store';
import {
  CAD_LITE_SCHEMA_VERSION,
  deserializeCadLiteFile,
  migrateCadLiteFile,
  normalizeProjectState,
  serializeCadLiteFile,
  type CadLiteFile,
} from '../persistence';

export interface ProjectLifecycleOptions {
  appVersion?: string;
  beforeReplace?: () => void;
}

export interface ProjectReplacementResult {
  file: CadLiteFile;
  revision: number;
  autosaved: boolean;
}

/**
 * Owns whole-project import/export/reset semantics.
 *
 * Validation and migration always finish before beforeReplace() is invoked, so
 * malformed or unsupported input cannot cancel active work or mutate the store.
 * Successful replacements deliberately start a fresh history timeline and are
 * flushed to autosave immediately.
 */
export class ProjectLifecycle {
  private readonly appVersion: string;
  private readonly beforeReplace: (() => void) | undefined;

  constructor(
    private readonly store: AppStore,
    private readonly effects: ApplicationEffects,
    options: ProjectLifecycleOptions = {},
  ) {
    this.appVersion = options.appVersion ?? CAD_LITE_ARCHITECTURE_VERSION;
    this.beforeReplace = options.beforeReplace;
  }

  exportFile(): CadLiteFile {
    return cadLiteFileFromApplicationState(
      this.store.getState(),
      this.appVersion,
    );
  }

  exportJson(pretty = true): string {
    return serializeCadLiteFile(this.exportFile(), pretty);
  }

  importJson(json: string): ProjectReplacementResult {
    const file = deserializeCadLiteFile(json);
    return this.replace(file, 'Import project');
  }

  importPayload(payload: unknown): ProjectReplacementResult {
    const file = migrateCadLiteFile(payload);
    return this.replace(file, 'Import project');
  }

  resetProject(): ProjectReplacementResult {
    const current = this.store.getState();
    const file: CadLiteFile = {
      schemaVersion: CAD_LITE_SCHEMA_VERSION,
      appVersion: this.appVersion,
      project: normalizeProjectState({}),
      editor: {
        activeLayoutId: null,
        workspace: 'design',
        // New projects keep the user's durable editor preferences while
        // clearing all project/session content.
        preferences: current.preferences,
      },
    };

    return this.replace(file, 'New project');
  }

  private replace(
    file: CadLiteFile,
    label: string,
  ): ProjectReplacementResult {
    // Build the complete replacement before touching the live application.
    const nextState = applicationStateFromCadLiteFile(file);

    this.beforeReplace?.();
    this.store.replaceState(nextState, label);
    this.effects.history.reset(label);
    const autosaved = this.effects.autosave.flush();

    return {
      file: this.exportFile(),
      revision: this.store.getRevision(),
      autosaved,
    };
  }
}
