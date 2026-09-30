import type {
  ApplicationState,
  ReadonlyApplicationState,
} from '../state';
import type {
  HistoryPolicy,
  PersistencePolicy,
} from '../store';

export interface AppCommand {
  type: string;
  label: string;
  history: HistoryPolicy;
  persistence: PersistencePolicy;
  reduce(state: ReadonlyApplicationState): ApplicationState;
}

export interface CommandSummary {
  type: string;
  label: string;
  history: HistoryPolicy;
  persistence: PersistencePolicy;
}

export function summarizeCommand(command: AppCommand): CommandSummary {
  return {
    type: command.type,
    label: command.label,
    history: command.history,
    persistence: command.persistence,
  };
}
