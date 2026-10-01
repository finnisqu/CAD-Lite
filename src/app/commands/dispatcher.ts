import { synchronizeCommandInvariants } from '../command-invariants';
import type { ReadonlyApplicationState } from '../state';
import type {
  AppStore,
  HistoryPolicy,
  PersistencePolicy,
  StoreChangeEvent,
} from '../store';
import type { AppCommand } from './types';

export interface TransactionOptions {
  history?: HistoryPolicy;
  persistence?: PersistencePolicy;
}

function stateChanged(
  previous: ReadonlyApplicationState,
  current: ReadonlyApplicationState,
): boolean {
  return (
    previous.project !== current.project ||
    previous.session !== current.session ||
    previous.preferences !== current.preferences
  );
}

function transactionHistory(commands: readonly AppCommand[]): HistoryPolicy {
  return commands.some((command) => command.history === 'record') ? 'record' : 'skip';
}

function transactionPersistence(commands: readonly AppCommand[]): PersistencePolicy {
  return commands.some((command) => command.persistence === 'save') ? 'save' : 'skip';
}

export class CommandDispatcher {
  constructor(private readonly store: AppStore) {}

  execute(command: AppCommand): StoreChangeEvent | null {
    const previous = this.store.getState();
    const reduced = command.reduce(previous);

    if (!stateChanged(previous, reduced)) return null;
    const next = synchronizeCommandInvariants(reduced);

    return this.store.commit(next, {
      kind: 'command',
      label: command.label,
      commandTypes: [command.type],
      history: command.history,
      persistence: command.persistence,
    });
  }

  executeTransaction(
    label: string,
    commands: readonly AppCommand[],
    options: TransactionOptions = {},
  ): StoreChangeEvent | null {
    const previous = this.store.getState();
    let working: ReadonlyApplicationState = previous;
    const applied: AppCommand[] = [];

    commands.forEach((command) => {
      const reduced = command.reduce(working);
      if (!stateChanged(working, reduced)) return;
      working = synchronizeCommandInvariants(reduced);
      applied.push(command);
    });

    if (applied.length === 0) return null;

    return this.store.commit(working, {
      kind: 'transaction',
      label,
      commandTypes: applied.map((command) => command.type),
      history: options.history ?? transactionHistory(applied),
      persistence: options.persistence ?? transactionPersistence(applied),
    });
  }
}
