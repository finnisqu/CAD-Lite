import type {
  StartupRecovery,
  StartupRecoveryState,
} from '../app';

export interface StartupRecoverySurfaceOptions {
  root: ParentNode;
  recovery: StartupRecovery;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

export class StartupRecoverySurface {
  private readonly root: ParentNode;
  private readonly recovery: StartupRecovery;
  private overlay: HTMLElement | null = null;

  constructor(options: StartupRecoverySurfaceOptions) {
    this.root = options.root;
    this.recovery = options.recovery;
  }

  mount(): void {
    if (this.overlay) return;
    this.render(this.recovery.inspect());
  }

  unmount(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  private render(state: StartupRecoveryState): void {
    this.unmount();
    if (state.status === 'none' || state.status === 'current') return;

    const documentRef =
      this.root instanceof Document
        ? this.root
        : this.root instanceof Element
          ? this.root.ownerDocument
          : document;

    const overlay = documentRef.createElement('div');
    overlay.className = 'lc-startup-recovery-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'lc-startup-recovery-title');

    const card = documentRef.createElement('section');
    card.className = 'lc-startup-recovery-card';

    const title = documentRef.createElement('h2');
    title.id = 'lc-startup-recovery-title';

    const message = documentRef.createElement('p');
    message.className = 'lc-startup-recovery-message';

    const details = documentRef.createElement('p');
    details.className = 'lc-startup-recovery-details';

    const actions = documentRef.createElement('div');
    actions.className = 'lc-startup-recovery-actions';

    if (state.status === 'available') {
      title.textContent = 'Recover autosaved project?';
      message.textContent =
        'CAD Lite found an autosave that differs from the project supplied at startup.';
      const name = state.projectName.trim() || 'Untitled project';
      const date = state.projectDate.trim();
      details.textContent = `${name}${date ? ` · ${date}` : ''} · ${state.layoutCount} ${plural(state.layoutCount, 'layout')}`;

      const recoverButton = documentRef.createElement('button');
      recoverButton.type = 'button';
      recoverButton.className = 'lc-startup-recovery-primary';
      recoverButton.textContent = 'Recover Autosave';
      recoverButton.addEventListener('click', () => {
        this.recovery.recover();
        this.unmount();
      });

      const currentButton = documentRef.createElement('button');
      currentButton.type = 'button';
      currentButton.textContent = 'Use Current Project';
      currentButton.addEventListener('click', () => {
        this.recovery.useCurrentProject();
        this.unmount();
      });

      actions.append(recoverButton, currentButton);
    } else {
      title.textContent = 'Autosave could not be recovered';
      message.textContent =
        'The stored autosave is damaged or unsupported. Your current startup project has not been changed.';
      details.textContent = state.error.message;

      const discardButton = documentRef.createElement('button');
      discardButton.type = 'button';
      discardButton.className = 'lc-startup-recovery-primary';
      discardButton.textContent = 'Discard Autosave & Continue';
      discardButton.addEventListener('click', () => {
        this.recovery.useCurrentProject();
        this.unmount();
      });
      actions.append(discardButton);
    }

    card.append(title, message, details, actions);
    overlay.append(card);
    documentRef.body.append(overlay);
    this.overlay = overlay;
  }
}
