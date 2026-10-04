import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  ToolController,
  applicationStateFromLegacyPayload,
  setWorkspace,
} from '../src/app';
import {
  floorPlanModalTabTargetIndex,
  shouldBlockFloorPlanModalKey,
} from '../src/browser/floor-plan-modal';
import {
  createProductionOutputMetadata,
  productionOutputFilename,
  productionOutputStateForLayout,
} from '../src/browser/production-output-model';
import floorPlanCalibrationSource from '../src/browser/floor-plan-calibration-surface.ts?raw';
import floorPlanEditorSource from '../src/browser/floor-plan-image-editor.ts?raw';
import floorPlanModalSource from '../src/browser/floor-plan-modal.ts?raw';
import floorPlanPdfSource from '../src/browser/floor-plan-pdf-import.ts?raw';
import floorPlanPreparationSource from '../src/browser/floor-plan-preparation-surface.ts?raw';
import outputSurfaceSource from '../src/browser/production-output-surface.ts?raw';
import projectFileSource from '../src/browser/project-file-surface.ts?raw';
import viewportSource from '../src/browser/production-viewport-surface.ts?raw';
import canvasKeyboardSource from '../src/browser/canvas-keyboard-surface.ts?raw';
import pieceCanvasSource from '../src/browser/piece-canvas-surface.ts?raw';
import { v159ProjectFixture } from './fixtures/v159-project';

function fixtureState() {
  return applicationStateFromLegacyPayload(v159ProjectFixture);
}

function toolHarness() {
  const store = new AppStore(fixtureState());
  const commands = new CommandDispatcher(store);
  commands.execute(setWorkspace('design'));
  return { store, commands, tools: new ToolController(store, commands) };
}

describe('Batch 82 Floor Plan browser workflow acceptance', () => {
  it('keeps Tab navigation available while Floor Plan modals isolate CAD shortcuts', () => {
    expect(shouldBlockFloorPlanModalKey('Escape')).toBe(false);
    expect(shouldBlockFloorPlanModalKey('Tab')).toBe(false);
    expect(shouldBlockFloorPlanModalKey('d')).toBe(true);
    expect(shouldBlockFloorPlanModalKey('Delete')).toBe(true);
  });

  it('wraps modal focus only at the dialog boundaries or when focus is outside', () => {
    expect(floorPlanModalTabTargetIndex(-1, 4, false)).toBe(0);
    expect(floorPlanModalTabTargetIndex(-1, 4, true)).toBe(3);
    expect(floorPlanModalTabTargetIndex(3, 4, false)).toBe(0);
    expect(floorPlanModalTabTargetIndex(0, 4, true)).toBe(3);
    expect(floorPlanModalTabTargetIndex(1, 4, false)).toBeNull();
    expect(floorPlanModalTabTargetIndex(2, 4, true)).toBeNull();
    expect(floorPlanModalTabTargetIndex(0, 0, false)).toBeNull();
  });

  it('puts initial focus inside the modal and restores the previous focus on close', () => {
    expect(floorPlanModalSource).toContain('const previousActive = document.activeElement');
    expect(floorPlanModalSource).toContain('closeButton.focus({ preventScroll: true });');
    expect(floorPlanModalSource).toContain('previousActive.focus?.()');
    expect(floorPlanModalSource).toContain('FLOOR_PLAN_MODAL_FOCUSABLE');
  });

  it('keeps PDF import, page selection, full-resolution preparation, and editor handoff connected', () => {
    expect(floorPlanPdfSource).toContain('openFloorPlanPdfImport');
    expect(floorPlanPdfSource).toContain('pdfjs.getDocument');
    expect(floorPlanPdfSource).toContain('pdf.numPages');
    expect(floorPlanPdfSource).toContain('Math.round(900 * previewZoom)');
    expect(floorPlanPdfSource).toContain('3000');
    expect(floorPlanPdfSource).toContain("'Prepare Page'");
    expect(floorPlanPdfSource).toContain("pageCanvas.toDataURL('image/png')");

    expect(floorPlanPreparationSource).toContain("file.type === 'application/pdf'");
    expect(floorPlanPreparationSource).toContain('openFloorPlanPdfImport');
    expect(floorPlanPreparationSource).toContain('openFloorPlanImageEditor');
    expect(floorPlanPreparationSource).toContain('reader.readAsDataURL(file)');
  });

  it('keeps rotate, crop, level, erase, cleanup history, and final import in the preparation editor', () => {
    for (const label of [
      "'Crop'",
      "'Reset Crop'",
      "'Level'",
      "'↶ 90°'",
      "'↷ 90°'",
      "'Eraser'",
      "'Reset Cleanup'",
      "'Undo'",
      "'Redo'",
      "'Import Plan'",
    ]) {
      expect(floorPlanEditorSource).toContain(label);
    }
    expect(floorPlanEditorSource).toContain("addEventListener('pointercancel'");
  });

  it('keeps calibration Escape and square nudge keys isolated from editable fields', () => {
    expect(floorPlanCalibrationSource).toContain('private editableTarget');
    expect(floorPlanCalibrationSource).toContain('isFloorPlanCalibrationArrowKey');
    expect(floorPlanCalibrationSource).toContain('nudgeFloorPlanCalibrationSquare');
    expect(floorPlanCalibrationSource).toContain("event.key === 'Escape'");
    expect(floorPlanCalibrationSource).toContain('event.shiftKey');
    expect(floorPlanCalibrationSource).toContain('input.focus();');
    expect(floorPlanCalibrationSource).toContain('input.select();');
  });
});

describe('Batch 82 output and file acceptance', () => {
  it('freezes production output metadata and filenames for current/all PDF, PNG, and SVG', () => {
    const state = fixtureState();
    const metadata = createProductionOutputMetadata(state, 'layout-kitchen', '2026-10-04');

    expect(metadata).toEqual({
      projectName: 'Architecture Test',
      projectDate: '2026-09-30',
      projectNotes: 'Golden migration seed',
      layoutId: 'layout-kitchen',
      layoutName: 'Kitchen',
    });
    if (!metadata) throw new Error('Fixture output metadata missing');

    expect(productionOutputFilename(metadata, 'pdf-current')).toBe(
      'Architecture_Test_2026-09-30.pdf',
    );
    expect(productionOutputFilename(metadata, 'pdf-all')).toBe(
      'Architecture_Test_2026-09-30_AllLayouts.pdf',
    );
    expect(productionOutputFilename(metadata, 'png')).toBe(
      'Architecture_Test_2026-09-30.png',
    );
    expect(productionOutputFilename(metadata, 'svg')).toBe(
      'Architecture_Test_2026-09-30.svg',
    );
  });

  it('prepares output layout state without mutating durable project/preferences state', () => {
    const state = fixtureState();
    const before = structuredClone(state);
    const preview = productionOutputStateForLayout(state, 'layout-kitchen');

    expect(preview.project).toBe(state.project);
    expect(preview.preferences).toBe(state.preferences);
    expect(preview.session.activeLayoutId).toBe('layout-kitchen');
    expect(preview.session.selection).toEqual({ kind: 'none' });
    expect(preview.session.transient).toEqual({});
    expect(state).toEqual(before);
  });

  it('keeps PDF/PNG/SVG preview rendering separate from canonical JSON persistence', () => {
    expect(outputSurfaceSource).toContain('ApplicationStatePreview');
    expect(outputSurfaceSource).toContain('.run(async ({ replace }) => {');
    expect(outputSurfaceSource).toContain('productionOutputStateForLayout');
    expect(outputSurfaceSource).toContain('exportAllPdf');
    expect(outputSurfaceSource).toContain('exportCurrentPdf');
    expect(outputSurfaceSource).toContain('exportPng');
    expect(outputSurfaceSource).toContain('exportSvg');
    expect(outputSurfaceSource).not.toContain('exportJson');
    expect(outputSurfaceSource).not.toContain('importJson');

    expect(projectFileSource).toContain('ProjectLifecycle');
    expect(projectFileSource).toContain('this.lifecycle.exportFile()');
    expect(projectFileSource).toContain('this.lifecycle.exportJson(true)');
    expect(projectFileSource).toContain('this.lifecycle.importJson(json)');
    expect(projectFileSource).toContain('.cadlite.json');
    expect(projectFileSource).not.toContain('exportAllPdf');
  });
});

describe('Batch 82 focus-mode and tool lifecycle acceptance', () => {
  it('keeps zoom, anchored scroll, resize, Theater, and Fullscreen browser paths wired', () => {
    expect(viewportSource).toContain('anchoredViewportScrollOffset');
    expect(viewportSource).toContain("addEventListener('wheel'");
    expect(viewportSource).toContain("addEventListener(\n      'resize'");
    expect(viewportSource).toContain('requestFullscreen');
    expect(viewportSource).toContain('exitFullscreen');
    expect(viewportSource).toContain("classList.toggle('is-theater'");
    expect(viewportSource).toContain("classList.toggle('is-fullscreen'");
  });

  it('keeps editable/defaultPrevented keyboard isolation ahead of global canvas actions', () => {
    expect(canvasKeyboardSource).toContain(
      'event.defaultPrevented || this.editableTarget(event.target)',
    );
    expect(canvasKeyboardSource).toContain("event.key !== 'Delete' && event.key !== 'Backspace'");
    expect(canvasKeyboardSource).toContain("event.key === 'Escape'");
    expect(canvasKeyboardSource).toContain("key === 'c'");
    expect(canvasKeyboardSource).toContain("key === 'v'");
    expect(canvasKeyboardSource).toContain("key === 'd'");
    expect(pieceCanvasSource).toContain('this.tools.handleKeyDown');
  });

  it('preserves momentary release, locked Escape, and Room Feature parent-return semantics', () => {
    const { tools } = toolHarness();

    expect(tools.handleKeyDown({ key: 'd' })).toBe(true);
    expect(tools.getActiveTool()?.id).toBe('dimension');
    expect(tools.handleKeyUp({ key: 'd' })).toBe(true);
    expect(tools.getActiveTool()).toBeNull();

    expect(tools.activateLocked('radius')).toBe(true);
    expect(tools.handleKeyDown({ key: 'Escape' })).toBe(true);
    expect(tools.getActiveTool()).toBeNull();

    expect(tools.activateLocked('roomFeatures')).toBe(true);
    expect(tools.activateLocked('roomWall')).toBe(true);
    expect(tools.handleKeyDown({ key: 'Escape' })).toBe(true);
    expect(tools.getActiveTool()).toMatchObject({ id: 'roomFeatures' });
  });
});
