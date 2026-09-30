import {
  cadLiteFileFromApplicationState,
} from '../bridge';
import type { AppStore, StoreChangeEvent } from '../store';
import {
  deserializeCadLiteFile,
  serializeCadLiteFile,
  type CadLiteFile,
} from '../../persistence';

export const DEFAULT_AUTOSAVE_KEY = 'cadlite:autosave';
export const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 400;
export const DEFAULT_AUTOSAVE_LARGE_PAYLOAD = 4_500_000;

export interface AutosaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type AutosavePhase = 'idle' | 'pending' | 'saved' | 'error';

export interface AutosaveStatus {
  phase: AutosavePhase;
  pendingRevision: number | null;
  lastSavedRevision: number | null;
  lastPayloadLength: number | null;
  error: Error | null;
}

export type AutosaveListener = (status: AutosaveStatus) => void;

export type AutosaveReadResult =
  | { status: 'empty' }
  | { status: 'loaded'; file: CadLiteFile }
  | { status: 'error'; error: Error };

export interface AutosaveManagerOptions {
  key?: string;
  debounceMs?: number;
  largePayloadThreshold?: number;
  appVersion?: string;
  onLargePayload?: (payloadLength: number) => void;
  onError?: (error: Error) => void;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class AutosaveManager {
  private readonly key: string;
  private readonly debounceMs: number;
  private readonly largePayloadThreshold: number;
  private readonly appVersion: string;
  private readonly onLargePayload:
    | ((payloadLength: number) => void)
    | undefined;
  private readonly onError: ((error: Error) => void) | undefined;
  private unsubscribeStore: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<AutosaveListener>();
  private status: AutosaveStatus = {
    phase: 'idle',
    pendingRevision: null,
    lastSavedRevision: null,
    lastPayloadLength: null,
    error: null,
  };

  constructor(
    private readonly store: AppStore,
    private readonly storage: AutosaveStorage,
    options: AutosaveManagerOptions = {},
  ) {
    this.key = options.key ?? DEFAULT_AUTOSAVE_KEY;
    this.debounceMs = Math.max(
      0,
      Math.floor(options.debounceMs ?? DEFAULT_AUTOSAVE_DEBOUNCE_MS),
    );
    this.largePayloadThreshold = Math.max(
      1,
      Math.floor(
        options.largePayloadThreshold ?? DEFAULT_AUTOSAVE_LARGE_PAYLOAD,
      ),
    );
    this.appVersion = options.appVersion ?? '1.6.0-dev.0';
    this.onLargePayload = options.onLargePayload;
    this.onError = options.onError;
  }

  start(): void {
    if (this.unsubscribeStore) return;

    this.unsubscribeStore = this.store.subscribe((event) => {
      if (event.persistence === 'save') this.schedule(event);
    });
  }

  stop(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
  }

  dispose(flushPending = false): void {
    this.stop();

    if (flushPending && this.status.phase === 'pending') {
      this.flush();
      return;
    }

    this.cancelTimer();
  }

  subscribe(listener: AutosaveListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): AutosaveStatus {
    return { ...this.status };
  }

  schedule(event: Pick<StoreChangeEvent, 'revision'>): void {
    this.cancelTimer();
    this.status = {
      ...this.status,
      phase: 'pending',
      pendingRevision: event.revision,
      error: null,
    };
    this.emit();

    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
  }

  flush(): boolean {
    this.cancelTimer();

    try {
      const file = cadLiteFileFromApplicationState(
        this.store.getState(),
        this.appVersion,
      );
      const payload = serializeCadLiteFile(file);

      if (payload.length > this.largePayloadThreshold) {
        this.onLargePayload?.(payload.length);
      }

      this.storage.setItem(this.key, payload);
      this.status = {
        phase: 'saved',
        pendingRevision: null,
        lastSavedRevision: this.store.getRevision(),
        lastPayloadLength: payload.length,
        error: null,
      };
      this.emit();
      return true;
    } catch (value) {
      const error = asError(value);
      this.status = {
        ...this.status,
        phase: 'error',
        pendingRevision: null,
        error,
      };
      this.onError?.(error);
      this.emit();
      return false;
    }
  }

  read(): AutosaveReadResult {
    const raw = this.storage.getItem(this.key);
    if (!raw) return { status: 'empty' };

    try {
      return {
        status: 'loaded',
        file: deserializeCadLiteFile(raw),
      };
    } catch (value) {
      return {
        status: 'error',
        error: asError(value),
      };
    }
  }

  clear(): void {
    this.cancelTimer();
    this.storage.removeItem(this.key);
    this.status = {
      phase: 'idle',
      pendingRevision: null,
      lastSavedRevision: null,
      lastPayloadLength: null,
      error: null,
    };
    this.emit();
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(): void {
    const status = this.getStatus();
    this.listeners.forEach((listener) => listener(status));
  }
}
