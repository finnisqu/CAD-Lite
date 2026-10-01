import type { CadLiteFile } from '../persistence';
import type { ApplicationEffects } from './effects';
import type { ProjectLifecycle, ProjectReplacementResult } from './project-lifecycle';

export type StartupRecoveryState =
  | { status: 'none' }
  | { status: 'current'; file: CadLiteFile }
  | {
      status: 'available';
      file: CadLiteFile;
      projectName: string;
      projectDate: string;
      layoutCount: number;
    }
  | { status: 'corrupt'; error: Error };

export interface StartupUseCurrentResult {
  autosaved: boolean;
}

function samePersistedContent(a: CadLiteFile, b: CadLiteFile): boolean {
  return JSON.stringify({ project: a.project, editor: a.editor }) ===
    JSON.stringify({ project: b.project, editor: b.editor });
}

/**
 * Owns the startup decision between the payload supplied by the host page and
 * the previous local autosave.
 *
 * The coordinator never replaces application state during inspection. A
 * recoverable autosave must be explicitly accepted; a corrupt autosave is
 * isolated until the user explicitly discards it. Identical project/editor
 * payloads are recognized across app builds so normal reloads do not create a
 * recovery prompt just because build metadata changed.
 */
export class StartupRecovery {
  private state: StartupRecoveryState = { status: 'none' };

  constructor(
    private readonly lifecycle: ProjectLifecycle,
    private readonly effects: ApplicationEffects,
  ) {}

  inspect(): StartupRecoveryState {
    const result = this.effects.autosave.read();

    if (result.status === 'empty') {
      this.state = { status: 'none' };
      return this.state;
    }

    if (result.status === 'error') {
      this.state = { status: 'corrupt', error: result.error };
      return this.state;
    }

    const current = this.lifecycle.exportFile();
    if (samePersistedContent(result.file, current)) {
      this.state = { status: 'current', file: result.file };
      return this.state;
    }

    this.state = {
      status: 'available',
      file: result.file,
      projectName: result.file.project.meta.name,
      projectDate: result.file.project.meta.date,
      layoutCount: result.file.project.layouts.length,
    };
    return this.state;
  }

  getState(): StartupRecoveryState {
    return this.state;
  }

  recover(): ProjectReplacementResult {
    if (this.state.status !== 'available') {
      throw new Error('No recoverable CAD Lite autosave is available.');
    }

    const result = this.lifecycle.importPayload(this.state.file);
    this.state = { status: 'current', file: result.file };
    return result;
  }

  /**
   * Continue with the host-supplied startup project and replace any stale or
   * corrupt recovery payload with a fresh canonical autosave of that project.
   */
  useCurrentProject(): StartupUseCurrentResult {
    this.effects.autosave.clear();
    const autosaved = this.effects.autosave.flush();
    this.state = autosaved
      ? { status: 'current', file: this.lifecycle.exportFile() }
      : { status: 'none' };
    return { autosaved };
  }
}
