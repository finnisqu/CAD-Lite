export interface FloorPlanModal {
  readonly overlay: HTMLDivElement;
  readonly body: HTMLDivElement;
  readonly foot: HTMLDivElement;
  readonly close: () => void;
}

const FLOOR_PLAN_MODAL_FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const element = target as HTMLElement;
  const tag = element.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    element.isContentEditable
  );
}

export function shouldBlockFloorPlanModalKey(key: string): boolean {
  return key !== 'Escape' && key !== 'Tab';
}

export function floorPlanModalTabTargetIndex(
  activeIndex: number,
  focusableCount: number,
  shiftKey: boolean,
): number | null {
  if (focusableCount <= 0) return null;
  if (activeIndex < 0) return shiftKey ? focusableCount - 1 : 0;
  if (!shiftKey && activeIndex === focusableCount - 1) return 0;
  if (shiftKey && activeIndex === 0) return focusableCount - 1;
  return null;
}

export function createFloorPlanModal(
  document: Document,
  titleText: string,
  className: string,
  onClose?: () => void,
): FloorPlanModal {
  const previousActive = document.activeElement as HTMLElement | null;
  const overlay = document.createElement('div');
  overlay.className = 'lc-plan-modal-overlay';
  const appRoot = document.querySelector<HTMLElement>('.lite-cad');
  if (appRoot?.classList.contains('lc-theme-dark')) {
    overlay.classList.add('lc-theme-dark');
  }

  const dialog = document.createElement('div');
  dialog.className = `lc-plan-dialog ${className}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', titleText);

  const head = document.createElement('div');
  head.className = 'lc-plan-dialog-head';
  const title = document.createElement('strong');
  title.textContent = titleText;
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'lc-btn ghost lc-iconbtn';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Close');
  head.append(title, closeButton);

  const body = document.createElement('div');
  body.className = 'lc-plan-dialog-body';
  const foot = document.createElement('div');
  foot.className = 'lc-plan-dialog-foot';
  dialog.append(head, body, foot);
  overlay.appendChild(dialog);

  const host = document.fullscreenElement ?? document.body;
  host.appendChild(overlay);

  const view = document.defaultView;
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    view?.removeEventListener('keydown', blockCanvasKeys, true);
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (previousActive?.isConnected) previousActive.focus?.();
    onClose?.();
  };

  const blockCanvasKeys = (event: KeyboardEvent): void => {
    if (
      !shouldBlockFloorPlanModalKey(event.key) ||
      isEditableTarget(event.target)
    ) {
      return;
    }
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FLOOR_PLAN_MODAL_FOCUSABLE),
    );
    const activeIndex = focusable.indexOf(
      document.activeElement as HTMLElement,
    );
    const targetIndex = floorPlanModalTabTargetIndex(
      activeIndex,
      focusable.length,
      event.shiftKey,
    );
    if (targetIndex === null) return;

    event.preventDefault();
    event.stopPropagation();
    focusable[targetIndex]?.focus({ preventScroll: true });
  };

  closeButton.addEventListener('click', () => close());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) close();
  });
  view?.addEventListener('keydown', blockCanvasKeys, true);
  document.addEventListener('keydown', onKey, true);
  closeButton.focus({ preventScroll: true });

  return { overlay, body, foot, close };
}

export function createFloorPlanButton(
  document: Document,
  label: string,
  onClick: () => void,
  primary = false,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `lc-btn ${primary ? 'alt' : 'ghost'}`;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}
