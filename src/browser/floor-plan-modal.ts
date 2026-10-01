export interface FloorPlanModal {
  readonly overlay: HTMLDivElement;
  readonly body: HTMLDivElement;
  readonly foot: HTMLDivElement;
  readonly close: () => void;
}

export function createFloorPlanModal(
  document: Document,
  titleText: string,
  className: string,
  onClose?: () => void,
): FloorPlanModal {
  const overlay = document.createElement('div');
  overlay.className = 'lc-plan-modal-overlay';

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
  document.body.appendChild(overlay);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    overlay.remove();
    onClose?.();
  };
  closeButton.addEventListener('click', () => close());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) close();
  });

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
