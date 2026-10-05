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

const FLOOR_PLAN_EDITOR_HISTORY_LIMIT = 10;

interface EditorSnapshot {
  image: string;
  crop: Crop;
  cropFocused: boolean;
  transformed: boolean;
}

interface EditorControls {
  undo: HTMLButtonElement | null;
  redo: HTMLButtonElement | null;
  crop: HTMLButtonElement | null;
  level: HTMLButtonElement | null;
  erase: HTMLButtonElement | null;
  resetCleanup: HTMLButtonElement | null;
  brushWrap: HTMLLabelElement | null;
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

function flipCanvas(
  source: HTMLCanvasElement,
  flipX: boolean,
  flipY: boolean,
): HTMLCanvasElement {
  const canvas = source.ownerDocument.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(flipX ? canvas.width : 0, flipY ? canvas.height : 0);
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.drawImage(source, 0, 0);
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
  let crop = fullCrop(work);
  let cropFocused = false;
  let transformed = false;
  let mode: EditorMode = 'crop';
  let brushSize = 48;
  let previewZoom = 1;
  let eraseBase: HTMLCanvasElement | null = null;
  let eraseHover: Point | null = null;
  let levelLine: { start: Point; end: Point } | null = null;
  let pointer:
    | { id: number; start: Point; current: Point; last: Point }
    | null = null;
  const history: EditorSnapshot[] = [];
  let historyIndex = -1;
  let historyBusy = false;
  const controls: EditorControls = {
    undo: null,
    redo: null,
    crop: null,
    level: null,
    erase: null,
    resetCleanup: null,
    brushWrap: null,
  };

  const modal = createFloorPlanModal(
    options.document,
    'Prepare Floor Plan',
    'lc-plan-import-dialog',
    () => options.onModal?.(null),
  );
  options.onModal?.(modal);

  const controlsPanel = options.document.createElement('div');
  controlsPanel.className = 'lc-plan-editor-control-panel';
  const actionBar = options.document.createElement('div');
  actionBar.className = 'lc-plan-editor-actionbar';
  const utilityBar = options.document.createElement('div');
  utilityBar.className = 'lc-plan-editor-utilitybar';
  const help = options.document.createElement('div');
  help.className = 'lc-plan-help lc-plan-editor-help';
  help.textContent =
    'Crop to the plan area, level from a reference line, rotate or flip as needed, then use Eraser to clean unwanted plan content.';
  controlsPanel.append(actionBar, utilityBar, help);

  const preview = options.document.createElement('canvas');
  preview.className = 'lc-plan-editor-preview';
  preview.width = 1100;
  preview.height = 700;
  const meta = options.document.createElement('div');
  meta.className = 'lc-small lc-plan-muted lc-plan-editor-meta';
  modal.body.append(controlsPanel, preview, meta);

  let map = { source: fullCrop(work), scale: 1, ox: 0, oy: 0 };

  const commitCrop = (): boolean => {
    const bounded = clampCrop(crop, work);
    const isFull =
      bounded.x < 0.5 &&
      bounded.y < 0.5 &&
      Math.abs(bounded.w - work.width) < 1 &&
      Math.abs(bounded.h - work.height) < 1;
    if (isFull) {
      crop = fullCrop(work);
      cropFocused = false;
      return false;
    }
    work = cropCanvas(work, bounded, 3200);
    crop = fullCrop(work);
    cropFocused = false;
    transformed = true;
    return true;
  };

  const syncHistoryButtons = (): void => {
    if (controls.undo) {
      controls.undo.disabled = historyBusy || historyIndex <= 0;
    }
    if (controls.redo) {
      controls.redo.disabled =
        historyBusy || historyIndex >= history.length - 1;
    }
  };

  const pushHistory = (): void => {
    if (historyBusy) return;
    history.splice(historyIndex + 1);
    history.push({
      image: work.toDataURL('image/png'),
      crop: { ...crop },
      cropFocused,
      transformed,
    });
    if (history.length > FLOOR_PLAN_EDITOR_HISTORY_LIMIT) history.shift();
    historyIndex = history.length - 1;
    syncHistoryButtons();
  };

  const restoreHistory = async (index: number): Promise<void> => {
    if (historyBusy || index < 0 || index >= history.length) return;
    historyBusy = true;
    syncHistoryButtons();
    try {
      const snapshot = history[index]!;
      const restored = await loadImage(options.document, snapshot.image);
      work = imageToCanvas(restored, 3200);
      crop = clampCrop(snapshot.crop, work);
      cropFocused = snapshot.cropFocused;
      transformed = snapshot.transformed;
      pointer = null;
      levelLine = null;
      eraseBase = null;
      historyIndex = index;
      render();
    } finally {
      historyBusy = false;
      syncHistoryButtons();
    }
  };

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
      context.fillStyle = 'rgba(37,99,235,.08)';
      context.lineWidth = 2;
      context.setLineDash([8, 5]);
      const rx = ox + (bounded.x - source.x) * scale;
      const ry = oy + (bounded.y - source.y) * scale;
      const rw = bounded.w * scale;
      const rh = bounded.h * scale;
      if (!cropFocused || pointer) context.fillRect(rx, ry, rw, rh);
      context.strokeRect(rx, ry, rw, rh);
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
      (eraseBase ? ' · cleanup applied' : '') +
      ` · preview ${Math.round(previewZoom * 100)}%`;
    if (controls.resetCleanup) controls.resetCleanup.disabled = !eraseBase;
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
    if (!eraseBase) eraseBase = cloneCanvas(work);
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

  const setMode = (next: EditorMode): void => {
    mode = next;
    controls.crop?.classList.toggle('is-active', next === 'crop');
    controls.level?.classList.toggle('is-active', next === 'level');
    controls.erase?.classList.toggle('is-active', next === 'erase');
    if (controls.brushWrap) controls.brushWrap.hidden = next !== 'erase';
    pointer = null;
    levelLine = null;
    render();
  };

  const transformWork = (
    transform: (source: HTMLCanvasElement) => HTMLCanvasElement,
  ): void => {
    commitCrop();
    work = transform(work);
    crop = fullCrop(work);
    cropFocused = false;
    levelLine = null;
    eraseBase = null;
    transformed = true;
    pushHistory();
    render();
  };

  const group = (
    titleText: string,
    ...buttons: HTMLButtonElement[]
  ): HTMLDivElement => {
    const groupEl = options.document.createElement('div');
    groupEl.className = 'lc-plan-tool-group';
    const groupTitle = options.document.createElement('div');
    groupTitle.className = 'lc-plan-tool-group-title';
    groupTitle.textContent = titleText;
    const row = options.document.createElement('div');
    row.className = 'lc-plan-tool-group-row';
    buttons.forEach((button) => {
      button.classList.add('lc-plan-tool-btn');
      row.appendChild(button);
    });
    groupEl.append(groupTitle, row);
    return groupEl;
  };

  const undo = createFloorPlanButton(options.document, 'Undo', () => {
    void restoreHistory(historyIndex - 1);
  });
  const redo = createFloorPlanButton(options.document, 'Redo', () => {
    void restoreHistory(historyIndex + 1);
  });
  controls.undo = undo;
  controls.redo = redo;

  const cropButton = createFloorPlanButton(options.document, 'Crop', () =>
    setMode('crop'),
  );
  const resetCrop = createFloorPlanButton(options.document, 'Reset Crop', () => {
    crop = fullCrop(work);
    cropFocused = false;
    levelLine = null;
    pushHistory();
    render();
  });
  const levelButton = createFloorPlanButton(options.document, 'Level', () =>
    setMode('level'),
  );
  const rotateLeft = createFloorPlanButton(options.document, '↶ 90°', () =>
    transformWork((source) => rotateCanvas(source, -90)),
  );
  const rotateRight = createFloorPlanButton(options.document, '↷ 90°', () =>
    transformWork((source) => rotateCanvas(source, 90)),
  );
  const flipHorizontal = createFloorPlanButton(options.document, 'Flip H', () =>
    transformWork((source) => flipCanvas(source, true, false)),
  );
  const flipVertical = createFloorPlanButton(options.document, 'Flip V', () =>
    transformWork((source) => flipCanvas(source, false, true)),
  );
  const zoomOut = createFloorPlanButton(options.document, '−', () => {
    previewZoom = Math.max(0.5, previewZoom - 0.25);
    render();
  });
  const zoomIn = createFloorPlanButton(options.document, '+', () => {
    previewZoom = Math.min(3, previewZoom + 0.25);
    render();
  });
  const eraseButton = createFloorPlanButton(options.document, 'Eraser', () =>
    setMode(mode === 'erase' ? 'crop' : 'erase'),
  );
  const resetCleanup = createFloorPlanButton(
    options.document,
    'Reset Cleanup',
    () => {
      if (!eraseBase) return;
      work = cloneCanvas(eraseBase);
      eraseBase = null;
      pushHistory();
      render();
    },
  );
  controls.crop = cropButton;
  controls.level = levelButton;
  controls.erase = eraseButton;
  controls.resetCleanup = resetCleanup;

  actionBar.append(
    group('History', undo, redo),
    group('Crop', cropButton, resetCrop),
    group('Level', levelButton),
    group('Rotate', rotateLeft, rotateRight),
    group('Flip', flipHorizontal, flipVertical),
    group('Zoom', zoomOut, zoomIn),
    group('Cleanup', eraseButton, resetCleanup),
  );

  const brushWrap = options.document.createElement('label');
  brushWrap.className = 'lc-plan-brush-control lc-small';
  brushWrap.textContent = 'Brush';
  controls.brushWrap = brushWrap;
  const brush = options.document.createElement('input');
  brush.type = 'range';
  brush.min = '8';
  brush.max = '240';
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
  const zoomRead = options.document.createElement('span');
  zoomRead.className = 'lc-plan-zoom-read lc-plan-muted';
  const syncUtilityRead = (): void => {
    zoomRead.textContent = `Preview ${Math.round(previewZoom * 100)}%`;
  };
  utilityBar.append(brushWrap, zoomRead);

  const renderWithUtility = render;
  const renderAll = (): void => {
    renderWithUtility();
    syncUtilityRead();
  };

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
    renderAll();
  });

  preview.addEventListener('pointermove', (event) => {
    const point = localPoint(event);
    eraseHover = point;
    if (!pointer || pointer.id !== event.pointerId) {
      if (mode === 'erase') renderAll();
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
    renderAll();
  });

  preview.addEventListener('pointerleave', () => {
    eraseHover = null;
    if (!pointer && mode === 'erase') renderAll();
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
      renderAll();
      return;
    }

    if (mode === 'erase') {
      transformed = true;
      pushHistory();
      renderAll();
      return;
    }

    levelLine = null;
    const dx = completed.current.x - completed.start.x;
    const dy = completed.current.y - completed.start.y;
    if (Math.hypot(dx, dy) < 12) {
      renderAll();
      return;
    }
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const target = Math.round(angle / 90) * 90;
    transformWork((source) => rotateCanvas(source, target - angle));
    renderAll();
  };
  preview.addEventListener('pointerup', finishPointer);
  preview.addEventListener('pointercancel', finishPointer);

  pushHistory();
  setMode('crop');
  renderAll();

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
