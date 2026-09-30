import type { ProjectState } from '../domain/project';
import type { JsonObject } from '../domain/types';
import type { EditorPreferences, Workspace } from '../persistence';

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
  transient: JsonObject;
}

export interface ApplicationState {
  project: ProjectState;
  session: SessionState;
  preferences: EditorPreferences;
}

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

export type DeepReadonly<T> =
  T extends Primitive
    ? T
    : T extends readonly (infer U)[]
      ? readonly DeepReadonly<U>[]
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export type ReadonlyApplicationState = DeepReadonly<ApplicationState>;

export function emptySelection(): Selection {
  return { kind: 'none' };
}
