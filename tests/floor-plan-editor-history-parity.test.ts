import { describe, expect, it } from 'vitest';

import floorPlanEditorSource from '../src/browser/floor-plan-image-editor.ts?raw';

describe('Floor Plan preparation history parity', () => {
  it('keeps v1.5-style encoded local snapshots with the 10-entry cap', () => {
    expect(floorPlanEditorSource).toContain(
      'const FLOOR_PLAN_EDITOR_HISTORY_LIMIT = 10;',
    );
    expect(floorPlanEditorSource).toContain("image: work.toDataURL('image/png')");
    expect(floorPlanEditorSource).toContain(
      'if (history.length > FLOOR_PLAN_EDITOR_HISTORY_LIMIT) history.shift();',
    );
    expect(floorPlanEditorSource).not.toContain('canvas: cloneCanvas(work)');
  });

  it('restores encoded history snapshots without retaining another raw canvas copy', () => {
    expect(floorPlanEditorSource).toContain(
      'const restored = await loadImage(options.document, snapshot.image);',
    );
    expect(floorPlanEditorSource).toContain('work = imageToCanvas(restored, 3200);');
    expect(floorPlanEditorSource).toContain('let historyBusy = false;');
    expect(floorPlanEditorSource).toContain('historyBusy || historyIndex <= 0');
  });
});
