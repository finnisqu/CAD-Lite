import type { AppStore, StoreChangeEvent } from '../store';
import {
  captureHistorySnapshot,
  historySnapshotSignature,
  restoreHistorySnapshot,
  type HistorySnapshot,
} from './snapshot';

export const DEFAULT_HISTORY_LIMIT = 50;

export interface HistoryEntry {
  revision: number;
  label: string;
  snapshot: HistorySnapshot;
  signature: string;
}

export interface HistoryStatus {
  index: number;
  size: number;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

export type HistoryListener = (status: HistoryStatus) => void;

export interface HistoryManagerOptions {
  maxEntries?: number;
  initialLabel?: string;
}

export class HistoryManager {
  private readonly maxEntries: number;
  private readonly initialLabel: string;
  private entries: HistoryEntry[] = [];
  private index = -1;
  private unsubscribeStore: (() => void) | null = null;
  private readonly listeners = new Set<HistoryListener>();

  constructor(
    private readonly store: AppStore,
    options: HistoryManagerOptions = {},
  ) {
    this.maxEntries = Math.max(
      2,
      Math.floor(options.maxEntries ?? DEFAULT_HISTORY_LIMIT),
    );
    this.initialLabel = options.initialLabel ?? 'Initial state';
  }

  start(): void {
    if (this.entries.length === 0) this.reset();
    if (this.unsubscribeStore) return;

    this.unsubscribeStore = this.store.subscribe((event) => {
      if (event.history === 'record') this.record(event);
    });
  }

  stop(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
  }

  reset(label = this.initialLabel): void {
    const snapshot = captureHistorySnapshot(this.store.getState());
    this.entries = [
      {
        revision: this.store.getRevision(),
        label,
        snapshot,
        signature: historySnapshotSignature(snapshot),
      },
    ];
    this.index = 0;
    this.emit();
  }

  subscribe(listener: HistoryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): HistoryStatus {
    return {
      index: this.index,
      size: this.entries.length,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoLabel:
        this.index > 0 ? this.entries[this.index]?.label ?? null : null,
      redoLabel:
        this.index >= 0 && this.index < this.entries.length - 1
          ? this.entries[this.index + 1]?.label ?? null
          : null,
    };
  }

  getEntries(): readonly HistoryEntry[] {
    return this.entries;
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }

  undo(): boolean {
    if (!this.canUndo()) return false;

    const currentEntry = this.entries[this.index];
    return this.apply(
      this.index - 1,
      `Undo: ${currentEntry?.label ?? 'Change'}`,
      'history.undo',
    );
  }

  redo(): boolean {
    if (!this.canRedo()) return false;

    const targetEntry = this.entries[this.index + 1];
    return this.apply(
      this.index + 1,
      `Redo: ${targetEntry?.label ?? 'Change'}`,
      'history.redo',
    );
  }

  private record(event: StoreChangeEvent): void {
    const snapshot = captureHistorySnapshot(event.current);
    const signature = historySnapshotSignature(snapshot);
    const currentEntry = this.entries[this.index];

    if (currentEntry?.signature === signature) return;

    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({
      revision: event.revision,
      label: event.label,
      snapshot,
      signature,
    });

    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    this.index = this.entries.length - 1;
    this.emit();
  }

  private apply(
    targetIndex: number,
    label: string,
    commandType: string,
  ): boolean {
    const target = this.entries[targetIndex];
    if (!target) return false;

    const next = restoreHistorySnapshot(
      this.store.getState(),
      target.snapshot,
    );

    this.index = targetIndex;
    this.store.commit(next, {
      kind: 'system',
      label,
      commandTypes: [commandType],
      history: 'skip',
      persistence: 'save',
    });
    this.emit();
    return true;
  }

  private emit(): void {
    const status = this.getStatus();
    this.listeners.forEach((listener) => listener(status));
  }
}
