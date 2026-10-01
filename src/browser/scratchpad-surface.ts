import {
  updateProjectScratchpad,
  type ApplicationEffects,
  type AppStore,
  type CommandDispatcher,
  type ViewInvalidationBatch,
} from '../app';
import type { ProjectScratchpad } from '../domain/scratchpad';

export interface ScratchpadSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  effects: ApplicationEffects;
}

type DragState = {
  pointerId: number;
  dx: number;
  dy: number;
};

function ownerDocument(root: ParentNode): Document {
  if (root instanceof Document) return root;
  const document = (root as Node).ownerDocument;
  if (!document) throw new Error('Project Scratchpad requires a Document.');
  return document;
}

export class ScratchpadSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly effects: ApplicationEffects;
  private readonly document: Document;

  private abort: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private card: HTMLElement | null = null;
  private editor: HTMLElement | null = null;
  private grab: HTMLElement | null = null;
  private dockButton: HTMLButtonElement | null = null;
  private homeButton: HTMLButtonElement | null = null;
  private dockHost: HTMLElement | null = null;
  private overlayRoot: HTMLElement | null = null;
  private drag: DragState | null = null;
  private contentTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(options: ScratchpadSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.effects = options.effects;
    this.document = ownerDocument(options.root);
  }

  mount(): void {
    if (this.abort) return;
    const inspector = this.root.querySelector<HTMLElement>('#lc-inspector');
    if (!inspector) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.dockHost =
      inspector.closest<HTMLElement>('.lc-inspector-col') ??
      inspector.parentElement;
    this.overlayRoot =
      inspector.closest<HTMLElement>('.lite-cad') ??
      this.root.querySelector<HTMLElement>('.cad-lite-architecture-harness') ??
      this.document.body;
    if (!this.dockHost) return;
    this.dockHost.classList.add('lc-scratchpad-host');

    this.createDom();
    this.bindEvents(signal);
    this.observeSize();
    this.unsubscribe = this.effects.invalidation.subscribe((batch) =>
      this.renderInvalidation(batch),
    );
    this.syncFromState();
    queueMicrotask(() => this.syncFromState());
  }

  unmount(): void {
    this.flushContent();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.abort?.abort();
    this.abort = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.contentTimer) clearTimeout(this.contentTimer);
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.contentTimer = null;
    this.resizeTimer = null;
    this.card?.remove();
    this.homeButton?.remove();
    this.dockHost?.classList.remove('lc-scratchpad-host');
    this.card = null;
    this.editor = null;
    this.grab = null;
    this.dockButton = null;
    this.homeButton = null;
    this.dockHost = null;
    this.overlayRoot = null;
    this.drag = null;
  }

  private createDom(): void {
    const card = this.document.createElement('section');
    card.className = 'lc-scratchpad is-docked';
    card.setAttribute('aria-label', 'Project Scratchpad');

    const head = this.document.createElement('div');
    head.className = 'lc-scratchpad-head';
    const grab = this.document.createElement('span');
    grab.className = 'lc-scratchpad-grab';
    grab.dataset.scratchGrab = '1';
    grab.title = 'Undock / move Scratchpad';
    grab.setAttribute('aria-label', 'Undock or move Scratchpad');
    for (let index = 0; index < 6; index += 1) {
      grab.appendChild(this.document.createElement('i'));
    }

    const dock = this.document.createElement('button');
    dock.type = 'button';
    dock.className = 'lc-scratchpad-iconbtn';
    dock.dataset.scratchDock = '1';
    dock.title = 'Return Scratchpad to Inspector';
    dock.setAttribute('aria-label', 'Return Scratchpad to Inspector');
    dock.textContent = '↙';
    dock.hidden = true;
    head.append(grab, dock);

    const editor = this.document.createElement('div');
    editor.className = 'lc-scratchpad-editor';
    editor.contentEditable = 'true';
    editor.spellcheck = true;
    editor.dataset.placeholder = 'Scratchpad';
    card.append(head, editor);

    const home = this.document.createElement('button');
    home.type = 'button';
    home.className = 'lc-scratchpad-home';
    home.title = 'Return Scratchpad home';
    home.setAttribute('aria-label', 'Return Scratchpad home');
    home.innerHTML = '<span aria-hidden="true">▤</span>';

    this.dockHost?.append(card, home);
    this.card = card;
    this.editor = editor;
    this.grab = grab;
    this.dockButton = dock;
    this.homeButton = home;
  }

  private bindEvents(signal: AbortSignal): void {
    this.editor?.addEventListener('input', () => this.scheduleContentSave(), {
      signal,
    });
    this.editor?.addEventListener('blur', () => this.flushContent(), { signal });
    this.editor?.addEventListener(
      'keydown',
      (event) => this.onEditorKeyDown(event),
      { signal },
    );
    this.dockButton?.addEventListener(
      'click',
      () => this.setFloating(false),
      { signal },
    );
    this.homeButton?.addEventListener(
      'click',
      () => this.setFloating(false),
      { signal },
    );
    this.grab?.addEventListener(
      'pointerdown',
      (event) => this.onGrabPointerDown(event),
      { signal },
    );
    this.grab?.addEventListener(
      'pointermove',
      (event) => this.onGrabPointerMove(event),
      { signal },
    );
    this.grab?.addEventListener(
      'pointerup',
      (event) => this.finishDrag(event),
      { signal },
    );
    this.grab?.addEventListener(
      'pointercancel',
      (event) => this.finishDrag(event),
      { signal },
    );

    this.document.defaultView?.addEventListener(
      'resize',
      () => {
        if (this.store.getState().project.meta.scratchpad.floating) {
          this.placeFloating();
        }
      },
      { signal },
    );
  }

  private observeSize(): void {
    const ResizeObserverConstructor = this.document.defaultView?.ResizeObserver;
    if (!ResizeObserverConstructor || !this.card) return;
    this.resizeObserver = new ResizeObserverConstructor(() => {
      if (!this.card?.isConnected) return;
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = null;
        this.persistObservedSize();
      }, 140);
    });
    this.resizeObserver.observe(this.card);
  }

  private renderInvalidation(batch: ViewInvalidationBatch): void {
    if (batch.targets.includes('scratchpad')) this.syncFromState();
  }

  private current(): ProjectScratchpad {
    return this.store.getState().project.meta.scratchpad;
  }

  private scheduleContentSave(): void {
    if (this.contentTimer) clearTimeout(this.contentTimer);
    this.contentTimer = setTimeout(() => {
      this.contentTimer = null;
      this.persistContent();
    }, 120);
  }

  private persistContent(): void {
    if (!this.editor) return;
    this.commands.execute(
      updateProjectScratchpad({ html: this.editor.innerHTML }),
    );
  }

  private flushContent(): void {
    if (this.contentTimer) clearTimeout(this.contentTimer);
    this.contentTimer = null;
    this.persistContent();
  }

  private onEditorKeyDown(event: KeyboardEvent): void {
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && (key === 'b' || key === 'i' || key === 'u')) {
      event.preventDefault();
      const command = key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline';
      this.document.execCommand(command, false);
      this.scheduleContentSave();
    }
    event.stopPropagation();
  }

  private setFloating(
    floating: boolean,
    options: { preservePosition?: boolean } = {},
  ): void {
    const card = this.card;
    if (!card) return;
    this.flushContent();
    const current = this.current();
    if (current.floating === floating) {
      this.syncFromState();
      return;
    }

    const patch: Partial<ProjectScratchpad> = { floating };
    const rect = card.getBoundingClientRect();
    if (floating && options.preservePosition) {
      patch.left = Math.round(rect.left);
      patch.top = Math.round(rect.top);
      patch.width = Math.round(rect.width);
      patch.height = Math.min(560, Math.round(rect.height));
    } else if (!floating && current.floating) {
      patch.width = Math.round(rect.width);
      patch.height = Math.min(560, Math.round(rect.height));
      patch.left = Math.round(rect.left);
      patch.top = Math.round(rect.top);
    }
    this.commands.execute(updateProjectScratchpad(patch));
    this.syncFromState();
  }

  private onGrabPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.card || !this.grab) return;
    if (!this.current().floating) {
      this.setFloating(true, { preservePosition: true });
    }
    const rect = this.card.getBoundingClientRect();
    this.drag = {
      pointerId: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
    };
    this.grab.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  private onGrabPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    const card = this.card;
    if (!drag || !card || drag.pointerId !== event.pointerId) return;
    const rect = card.getBoundingClientRect();
    const bounds = this.appBounds();
    const margin = 8;
    const left = Math.max(
      bounds.left + margin,
      Math.min(bounds.right - rect.width - margin, event.clientX - drag.dx),
    );
    const top = Math.max(
      bounds.top + margin,
      Math.min(bounds.bottom - rect.height - margin, event.clientY - drag.dy),
    );
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    event.preventDefault();
  }

  private finishDrag(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId || !this.card) {
      return;
    }
    const rect = this.card.getBoundingClientRect();
    this.drag = null;
    try {
      this.grab?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    this.commands.execute(
      updateProjectScratchpad({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
      }),
    );
  }

  private persistObservedSize(): void {
    const card = this.card;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const scratchpad = this.current();
    if (scratchpad.floating) {
      this.commands.execute(
        updateProjectScratchpad({
          width: Math.round(rect.width),
          height: Math.min(560, Math.round(rect.height)),
        }),
      );
      this.placeFloating();
    } else {
      this.commands.execute(
        updateProjectScratchpad({
          dockHeight: Math.min(420, Math.round(rect.height)),
        }),
      );
    }
  }

  private appBounds(): DOMRect {
    const root = this.overlayRoot;
    const win = this.document.defaultView;
    if (root) return root.getBoundingClientRect();
    return new DOMRect(0, 0, win?.innerWidth ?? 0, win?.innerHeight ?? 0);
  }

  private placeFloating(): void {
    const card = this.card;
    if (!card || !this.current().floating) return;
    const scratchpad = this.current();
    const bounds = this.appBounds();
    const margin = 8;
    const width = Math.min(
      scratchpad.width,
      Math.max(280, bounds.width - margin * 2),
    );
    const height = Math.min(
      scratchpad.height,
      Math.max(190, Math.min(560, bounds.height - margin * 2)),
    );
    const fallbackLeft = Math.max(bounds.left + margin, bounds.right - width - margin);
    const fallbackTop = Math.max(bounds.top + margin, bounds.bottom - height - margin);
    const left = Math.max(
      bounds.left + margin,
      Math.min(
        bounds.right - width - margin,
        scratchpad.left ?? fallbackLeft,
      ),
    );
    const top = Math.max(
      bounds.top + margin,
      Math.min(
        bounds.bottom - height - margin,
        scratchpad.top ?? fallbackTop,
      ),
    );
    card.style.width = `${width}px`;
    card.style.height = `${height}px`;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  private syncFromState(): void {
    const card = this.card;
    const editor = this.editor;
    const dockHost = this.dockHost;
    const overlayRoot = this.overlayRoot;
    if (!card || !editor || !dockHost || !overlayRoot) return;

    const scratchpad = this.current();
    const targetHost = scratchpad.floating ? overlayRoot : dockHost;
    if (card.parentElement !== targetHost) targetHost.appendChild(card);
    card.classList.toggle('is-floating', scratchpad.floating);
    card.classList.toggle('is-docked', !scratchpad.floating);
    if (this.dockButton) this.dockButton.hidden = !scratchpad.floating;
    this.homeButton?.classList.toggle('is-away', scratchpad.floating);
    if (editor.innerHTML !== scratchpad.html) editor.innerHTML = scratchpad.html;

    if (scratchpad.floating) {
      card.style.removeProperty('max-height');
      this.placeFloating();
    } else {
      card.style.removeProperty('width');
      card.style.height = `${scratchpad.dockHeight}px`;
      card.style.removeProperty('left');
      card.style.removeProperty('top');
    }
  }
}
