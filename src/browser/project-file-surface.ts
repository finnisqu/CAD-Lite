import type { ProjectLifecycle } from '../app';
import type { BrowserConfirm } from './project-layout-surface';

export type BrowserProjectDownload = (
  filename: string,
  contents: string,
) => void;

export interface ProjectFileSurfaceOptions {
  root: ParentNode;
  lifecycle: ProjectLifecycle;
  confirm?: BrowserConfirm;
  download?: BrowserProjectDownload;
}

function defaultConfirm(message: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm(message);
}

function downloadText(filename: string, contents: string): void {
  if (typeof document === 'undefined') {
    throw new Error('Project export requires a browser document.');
  }

  const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function projectFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug || 'cad-lite-project'}.cadlite.json`;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class ProjectFileSurface {
  private readonly root: ParentNode;
  private readonly lifecycle: ProjectLifecycle;
  private readonly confirm: BrowserConfirm;
  private readonly download: BrowserProjectDownload;
  private abort: AbortController | null = null;
  private input: HTMLInputElement | null = null;
  private status: HTMLElement | null = null;

  constructor(options: ProjectFileSurfaceOptions) {
    this.root = options.root;
    this.lifecycle = options.lifecycle;
    this.confirm = options.confirm ?? defaultConfirm;
    this.download = options.download ?? downloadText;
  }

  mount(): void {
    if (this.abort) return;
    this.abort = new AbortController();
    const signal = this.abort.signal;

    const exportButton =
      this.root.querySelector<HTMLButtonElement>('#lc-export-project');
    const importButton =
      this.root.querySelector<HTMLButtonElement>('#lc-import-project');
    const newButton =
      this.root.querySelector<HTMLButtonElement>('#lc-new-project');
    this.input =
      this.root.querySelector<HTMLInputElement>('#lc-project-file-input');
    this.status =
      this.root.querySelector<HTMLElement>('#lc-file-status');

    exportButton?.addEventListener('click', () => this.exportProject(), { signal });
    importButton?.addEventListener('click', () => this.input?.click(), { signal });
    newButton?.addEventListener('click', () => this.resetProject(), { signal });
    this.input?.addEventListener('change', () => void this.importSelectedFile(), {
      signal,
    });
  }

  unmount(): void {
    this.abort?.abort();
    this.abort = null;
    this.input = null;
    this.status = null;
  }

  exportProject(): void {
    try {
      const file = this.lifecycle.exportFile();
      this.download(
        projectFilename(file.project.meta.name),
        this.lifecycle.exportJson(true),
      );
      this.setStatus('Project exported.');
    } catch (value) {
      this.setStatus(`Export failed: ${asError(value).message}`, true);
    }
  }

  private async importSelectedFile(): Promise<void> {
    const input = this.input;
    const file = input?.files?.[0];
    if (!input || !file) return;

    try {
      if (!this.confirm('Replace the current project with this imported file?')) {
        return;
      }

      const json = await file.text();
      const result = this.lifecycle.importJson(json);
      this.setStatus(
        result.autosaved
          ? 'Project imported and autosaved.'
          : 'Project imported, but autosave failed.',
        !result.autosaved,
      );
    } catch (value) {
      this.setStatus(`Import failed: ${asError(value).message}`, true);
    } finally {
      input.value = '';
    }
  }

  private resetProject(): void {
    if (!this.confirm('Start a new blank project? The current project will be replaced.')) {
      return;
    }

    const result = this.lifecycle.resetProject();
    this.setStatus(
      result.autosaved
        ? 'New project ready.'
        : 'New project ready, but autosave failed.',
      !result.autosaved,
    );
  }

  private setStatus(message: string, isError = false): void {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.dataset.state = isError ? 'error' : 'ok';
  }
}
