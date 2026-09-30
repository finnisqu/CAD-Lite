import type { ProjectState } from '../domain/project';
import type { JsonObject } from '../domain/types';
import type { EditorPreferences, Workspace } from '../persistence';
import type { InteractionState } from './interaction/types';

export type Selection =
  | { kind: 'none' }
  | { kind: 'pieces'; ids: string[] }
  | { kind: 'dimension'; id: string }
  | { kind: 'line'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'roomFeature'; id: string }
  | { kind: 'area'; id: string }
  | { kind: 'material'; id: string }
  | { kind: 'layout'; id: string }
  | { kind: 'slab'; id: string }
  | { kind: 'pieceGroup'; id: string };

export interface SessionState {
  activeLayoutId: string | null;
  workspace: Workspace;
  selection: Selection;
  interaction: InteractionState;
  transient: JsonObject;
}

export interface ApplicationState {
  project: ProjectState;
  session: SessionState;
  preferences: EditorPreferences;
}

/**
 * Store consumers cannot replace top-level domains directly.
 *
 * Nested domain types remain mutable for now because the canonical schema still
 * models historical JSON arrays/records as mutable values. Commands preserve
 * immutability through structural sharing, and the domain types can become
 * deeply readonly incrementally as those schemas are promoted.
 */
export type ReadonlyApplicationState = Readonly<ApplicationState>;

export function emptySelection(): Selection {
  return { kind: 'none' };
}
