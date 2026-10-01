import { createFloorPlan, type FloorPlan } from '../domain/floor-plans';
import type { BrowserEntityIdFactory } from './project-layout-surface';
import {
  createFloorPlanButton,
  createFloorPlanModal,
  type FloorPlanModal,
} from './floor-plan-modal';

type Point = { x: number; y: number };
type Crop = { x: number; y: number; w: number; h: number };
type EditorMode = 'crop' | 'level' | 'erase';

interface EditorSnapshot {
  canvas: HTMLCanvasElement;
  crop: Crop;
  cropFocused: boolean;
  transformed: boolean;
}

export interface FloorPlanImageEditorOptions {
  document: Document;
  dataURL: string;
  name: string;
  createId: BrowserEntityIdFactory;
  onCommit(plan: FloorPlan): void;
  onModal?(modal: FloorPlanModal | null): void;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = source.ownerDocument.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.drawImage(source, 0, 0);
  return canvas;
}

function fullCrop(canvas: HTMLCanvasElement): Crop {
  return { x: 0, y: 0, w: canvas.width, h: canvas.height };
}

function clampCrop(crop: Crop, canvas: HTMLCanvasElement): Crop {
  const x = Math.max(0, Math.min(canvas.width - 1, crop.x));
  const y = Math.max(0, Math.min(canvas.height - 1, crop.y));
  return {
    x,
    y,
    w: Math.max(1, Math.min(canvas.width - x, crop.w)),
    h: Math.max(1, Math.min(canvas.height - y, crop.h)),
  };
}

function loadImage(document: Document, dataURL: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = document.createElement('img');
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Plan image failed to load.'));
    image.src = dataURL;
  });
}

function imageToCanvas(
  image: HTMLImageElement,
  maxDimension = 3200,
): HTMLCanvasElement {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, maxDimension / Math.max(width, height, 1));
  const canvas = image.ownerDocument.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cropCanvas(
  source: HTMLCanvasElement,
  crop: Crop,
  maxDimension = 3000,
): HTMLCanvasElement {
  const bounded = clampCrop(crop, source);
  const sx = Math.max(0, Math.floor(bounded.x));
  const sy = Math.max(0, Math.floor(bounded.y));
  const sw = Math.max(1, Math.min(source.width - sx, Math.round(bounded.w)));
  const sh = Math.max(1, Math.min(source.height - sy, Math.round(bounded.h)));
  const scale = Math.min(1, maxDimension / Math.max(sw, sh, 1));
  const canvas = source.ownerDocument.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const width = Math.max(
    1,
    Math.ceil(source.width * cosine + source.height * sine),
  );
  const height = Math.max(
    1,
    Math.ceil(source.width * sine + source.height * cosine),
  );
  const canvas = source.ownerDocument.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.translate(width / 2, height / 2);
  context.rotate(radians);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function preparedDataURL(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL('image/webp', 0.92);
  return webp.startsWith('data:image/webp')
    ? webp
    : canvas.toDataURL('image/jpeg', 0.94);
}

export async function openFloorPlanImageEditor(
  options: FloorPlanImageEditorOptions,
): Promise<void> {
  const image = await loadImage(options.document, options.dataURL);
  let work = imageToCanvas(image);
  const initial = cloneCanvas(work);
  let crop = fullCrop(work);
  let cropFocused = false;
  let transformed = false;
  let mode: EditorMode = 'crop';
  let brushSize = 48;
  let previewZoom = 1;
  let eraseHover: Point | null = null;
  let levelLine: { start: Point; end: Point } | null = null;
  let pointer:
    | { id: number; start: Point; current: Point; last: Point }
    | null = null;
  const history: EditorSnapshot[] = [];
  let historyIndex = -1;

  let modal: FloorPlanModal;
  modal = createFloorPlanModal(
    options.document,
    'Prepare Floor Plan',
    'lc-plan-import-dialog',
    () => options.onModal?.(null),
  );
  options.onModal?.(modal);

  const toolbar = options.document.createElement('div');
  toolbar.className = 'lc-plan-editor-toolbar';
  const secondary = options.document.createElement('div');
  secondary.className = 'lc-plan-preview-controls';
  const preview = options.document.createElement('canvas');
  preview.className = 'lc-plan-editor-preview';
  preview.width = 1100;
  preview.height = 700;
  const meta = options.document.createElement('div');
  meta.className = 'lc-small lc-plan-muted';
  modal.body.append(toolbar, secondary, preview, meta);

  let map = { source: fullCrop(work), scale: 1, ox: 0, oy: 0 };

  const commitCrop = (): void => {
    const bounded = clampCrop(crop, work);
    const isFull =
      bounded.x < 0.5 &&
      bounded.y < 0.5 &&
      Math.abs(bounded.w - work.width) < 1 &&
      Math.abs(bounded.h - work.height) < 1;
    if (isFull) {
      crop = fullCrop(work);
      cropFocused = false;
      return;
    }
    work = cropCanvas(work, bounded, 3200);
    crop = fullCrop(work);
    cropFocused = false;
    transformed = true;
  };

  const restore = (snapshot: EditorSnapshot): void => {
    work = cloneCanvas(snapshot.canvas);
    crop = clampCrop(snapshot.crop, work);
    cropFocused = snapshot.cropFocused;
    transformed = snapshot.transformed;
    pointer = null;
    levelLine = null;
  };

  let undo: HTMLButtonElement;
  let redo: HTMLButtonElement;
  const syncHistoryButtons = (): void => {
    undo.disabled = historyIndex <= 0;
    redo.disabled = historyIndex >= history.length - 1;
  };
  const pushHistory = (): void => {
    history.splice(historyIndex + 1);
    history.push({
      canvas: cloneCanvas(work),
      crop: { ...crop },
      cropFocused,
      transformed,
    });
    historyIndex = history.length - 1;
    syncHistoryButtons();
  };

  let focus: HTMLButtonElement;
  const render = (): void => {
    const context = preview.getContext('2d');
    if (!context) return;
    context.fillStyle = '#f1f5f9';
    context.fillRect(0, 0, preview.width, preview.height);

    const source = cropFocused ? clampCrop(crop, work) : fullCrop(work);
    const fit = Math.min(preview.width / source.w, preview.height / source.h);
    const scale = Math.max(0.05, fit * previewZoom);
    const width = source.w * scale;
    const height = source.h * scale;
    const ox = (preview.width - width) / 2;
    const oy = (preview.height - height) / 2;
    map = { source, scale, ox, oy };

    context.drawImage(
      work,
      source.x,
      source.y,
      source.w,
      source.h,
      ox,
      oy,
      width,
      height,
    );

    if (mode === 'crop') {
      const bounded = clampCrop(crop, work);
      context.strokeStyle = '#2563eb';
      context.lineWidth = 2;
      context.setLineDash([8, 5]);
      context.strokeRect(
        ox + (bounded.x - source.x) * scale,
        oy + (bounded.y - source.y) * scale,
        bounded.w * scale,
        bounded.h * scale,
      );
      context.setLineDash([]);
    }

    if (mode === 'level' && levelLine) {
      context.strokeStyle = '#dc2626';
      context.lineWidth = 2;
      context.setLineDash([6, 4]);
      context.beginPath();
      context.moveTo(
        ox + (levelLine.start.x - source.x) * scale,
        oy + (levelLine.start.y - source.y) * scale,
      );
      context.lineTo(
        ox + (levelLine.end.x - source.x) * scale,
        oy + (levelLine.end.y - source.y) * scale,
      );
      context.stroke();
      context.setLineDash([]);
    }

    if (mode === 'erase' && eraseHover) {
      context.strokeStyle = 'rgba(37,99,235,.8)';
      context.setLineDash([4, 3]);
      context.beginPath();
      context.arc(
        ox + (eraseHover.x - source.x) * scale,
        oy + (eraseHover.y - source.y) * scale,
        Math.max(3, (brushSize * scale) / 2),
        0,
        Math.PI * 2,
      );
      context.stroke();
      context.setLineDash([]);
    }

    meta.textContent =
      `${Math.round(crop.w)} × ${Math.round(crop.h)} px selected` +
      (transformed ? ' · image adjusted' : '') +
      ` · preview ${Math.round(previewZoom * 100)}%`;
    focus.textContent = cropFocused ? 'Show Full' : 'Focus Crop';
  };

  const localPoint = (event: PointerEvent): Point => {
    const rect = preview.getBoundingClientRect();
    const px =
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * preview.width;
    const py =
      ((event.clientY - rect.top) / Math.max(rect.height, 1)) * preview.height;
    return {
      x: Math.max(
        map.source.x,
        Math.min(
          map.source.x + map.source.w,
          map.source.x + (px - map.ox) / map.scale,
        ),
      ),
      y: Math.max(
        map.source.y,
        Math.min(
          map.source.y + map.source.h,
          map.source.y + (py - map.oy) / map.scale,
        ),
      ),
    };
  };

  const eraseSegment = (from: Point, to: Point): void => {
    const context = work.getContext('2d');
    if (!context) return;
    context.save();
    context.strokeStyle = '#ffffff';
    context.fillStyle = '#ffffff';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = brushSize;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    if (from.x === to.x && from.y === to.y) {
      context.beginPath();
      context.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  };

  let cropButton: HTMLButtonElement;
  let levelButton: HTMLButtonElement;
  let eraseButton: HTMLButtonElement;
  let brushWrap: HTMLLabelElement;
  const setMode = (next: EditorMode): void => {
    mode = next;
    cropButton.classList.toggle('is-active', next === 'crop');
    levelButton.classList.toggle('is-active', next === 'level');
    eraseButton.classList.toggle('is-active', next === 'erase');
    brushWrap.hidden = next !== 'erase';
    pointer = null;
    levelLine = null;
    render();
  };

  cropButton = createFloorPlanButton(options.document, 'Crop', () =>
    setMode('crop'),
  );
  levelButton = createFloorPlanButton(options.document, 'Level', () =>
    setMode('level'),
  );
  eraseButton = createFloorPlanButton(options.document, 'Erase', () =>
    setMode('erase'),
  );
  const rotateLeft = createFloorPlanButton(options.document, '↶ 90°', () => {
    commitCrop();
    work = rotateCanvas(work, -90);
    crop = fullCrop(work);
    transformed = true;
    pushHistory();
    render();
  });
  const rotateRight = createFloorPlanButton(options.document, '↷ 90°', () => {
    commitCrop();
    work = rotateCanvas(work, 90);
    crop = fullCrop(work);
    transformed = true;
    pushHistory();
    render();
  });
  undo = createFloorPlanButton(options.document, 'Undo', () => {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    restore(history[historyIndex]!);
    syncHistoryButtons();
    render();
  });
  redo = createFloorPlanButton(options.document, 'Redo', () => {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    restore(history[historyIndex]!);
    syncHistoryButtons();
    render();
  });
  const reset = createFloorPlanButton(options.document, 'Reset', () => {
    work = cloneCanvas(initial);
    crop = fullCrop(work);
    cropFocused = false;
    transformed = false;
    pushHistory();
    render();
  });
  toolbar.append(
    cropButton,
    levelButton,
    eraseButton,
    rotateLeft,
    rotateRight,
    undo,
    redo,
    reset,
  );

  const zoomOut = createFloorPlanButton(options.document, '−', () => {
    previewZoom = Math.max(0.5, previewZoom - 0.25);
    render();
  });
  const zoomIn = createFloorPlanButton(options.document, '+', () => {
    previewZoom = Math.min(3, previewZoom + 0.25);
    render();
  });
  focus = createFloorPlanButton(options.document, 'Focus Crop', () => {
    cropFocused = !cropFocused;
    previewZoom = 1;
    render();
  });
  brushWrap = options.document.createElement('label');
  brushWrap.className = 'lc-plan-brush-control lc-small';
  brushWrap.textContent = 'Brush';
  const brush = options.document.createElement('input');
  brush.type = 'range';
  brush.min = '12';
  brush.max = '180';
  brush.step = '4';
  brush.value = String(brushSize);
  const brushValue = options.document.createElement('span');
  brushValue.textContent = `${brushSize}px`;
  brush.addEventListener('input', () => {
    brushSize = Number(brush.value) || 48;
    brushValue.textContent = `${brushSize}px`;
    render();
  });
  brushWrap.append(brush, brushValue);
  secondary.append(zoomOut, zoomIn, focus, brushWrap);

  preview.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const point = localPoint(event);
    pointer = {
      id: event.pointerId,
      start: point,
      current: point,
      last: point,
    };
    preview.setPointerCapture?.(event.pointerId);
    if (mode === 'level') levelLine = { start: point, end: point };
    if (mode === 'erase') eraseSegment(point, point);
    render();
  });

  preview.addEventListener('pointermove', (event) => {
    const point = localPoint(event);
    eraseHover = point;
    if (!pointer || pointer.id !== event.pointerId) {
      if (mode === 'erase') render();
      return;
    }
    pointer.current = point;
    if (mode === 'crop') {
      crop = clampCrop(
        {
          x: Math.min(pointer.start.x, point.x),
          y: Math.min(pointer.start.y, point.y),
          w: Math.max(1, Math.abs(point.x - pointer.start.x)),
          h: Math.max(1, Math.abs(point.y - pointer.start.y)),
        },
        work,
      );
    } else if (mode === 'level') {
      levelLine = { start: pointer.start, end: point };
    } else {
      eraseSegment(pointer.last, point);
      pointer.last = point;
    }
    render();
  });

  preview.addEventListener('pointerleave', () => {
    eraseHover = null;
    if (!pointer && mode === 'erase') render();
  });

  const finishPointer = (event: PointerEvent): void => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const completed = pointer;
    pointer = null;
    try {
      preview.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }

    if (mode === 'crop') {
      if (crop.w < 8 || crop.h < 8) {
        crop = fullCrop(work);
        cropFocused = false;
      } else {
        cropFocused = true;
        previewZoom = 1;
      }
      pushHistory();
      render();
      return;
    }

    if (mode === 'erase') {
      transformed = true;
      pushHistory();
      render();
      return;
    }

    levelLine = null;
    const dx = completed.current.x - completed.start.x;
    const dy = completed.current.y - completed.start.y;
    if (Math.hypot(dx, dy) < 12) {
      render();
      return;
    }
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const target = Math.round(angle / 90) * 90;
    commitCrop();
    work = rotateCanvas(work, target - angle);
    crop = fullCrop(work);
    cropFocused = false;
    transformed = true;
    pushHistory();
    render();
  };
  preview.addEventListener('pointerup', finishPointer);
  preview.addEventListener('pointercancel', finishPointer);

  pushHistory();
  setMode('crop');

  modal.foot.append(
    createFloorPlanButton(options.document, 'Cancel', () => modal.close()),
    createFloorPlanButton(
      options.document,
      'Import Plan',
      () => {
        const output = cropCanvas(work, crop);
        options.onCommit(
          createFloorPlan({
            id: options.createId('plan'),
            name: options.name || 'Floor Plan',
            dataURL: preparedDataURL(output),
            natW: output.width,
            natH: output.height,
          }),
        );
        modal.close();
      },
      true,
    ),
  );
}
