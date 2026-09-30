import { describe, expect, it } from 'vitest';

import {
  addRoomFeature,
  applicationStateFromLegacyPayload,
  deleteRoomFeature,
  setSelection,
  setWorkspace,
  updateRoomFeature,
} from '../src/app';
import {
  createRoomFeature,
  normalizeRoomFeature,
  roomFeatureCategory,
} from '../src/domain/room-features';
import {
  createRoomFeatureCanvasProjection,
  hitTestRoomFeatures,
} from '../src/browser/room-feature-canvas-model';
import { v159ProjectFixture } from './fixtures/v159-project';

function designState() {
  const payload = structuredClone(v159ProjectFixture);
  if (!payload.ui || typeof payload.ui !== 'object' || Array.isArray(payload.ui)) {
    throw new Error('Fixture UI shape changed');
  }
  payload.ui.workspace = 'layout';
  payload.active = 0;
  return applicationStateFromLegacyPayload(payload);
}

describe('Batch 23 typed Room Feature domain', () => {
  it('promotes the v1.5.99 Room Feature fixture into typed geometry', () => {
    const state = designState();
    const feature = state.project.layouts[0]?.roomFeatures[0];

    expect(feature).toMatchObject({
      id: 'room-1',
      kind: 'feature',
      featureType: 'base',
      x: 40,
      y: 100,
      length: 36,
      depth: 24,
      rotation: 0,
      visible: true,
      receivesCountertop: true,
      wallType: null,
    });
    expect(roomFeatureCategory(feature!)).toBe('cabinet');
  });

  it('preserves unknown historical metadata while normalizing known fields', () => {
    const feature = normalizeRoomFeature({
      id: 'legacy-run',
      kind: 'legacy',
      featureType: 'cabinet-run',
      x: 4.12345,
      y: 8.76543,
      length: 72,
      depth: 24,
      runMembers: ['A', 'B'],
      customLegacyFlag: true,
    });

    expect(feature.x).toBe(4.123);
    expect(feature.y).toBe(8.765);
    expect(feature.runMembers).toEqual(['A', 'B']);
    expect(feature.customLegacyFlag).toBe(true);
    expect(roomFeatureCategory(feature)).toBe('legacy-run');
  });

  it('classifies filler/panel, appliance, and wall compatibility shapes', () => {
    expect(
      roomFeatureCategory(
        normalizeRoomFeature({
          id: 'f',
          featureType: 'end-panel',
        }),
      ),
    ).toBe('filler-panel');
    expect(
      roomFeatureCategory(
        normalizeRoomFeature({
          id: 'a',
          featureType: 'dishwasher',
        }),
      ),
    ).toBe('appliance');
    const wall = normalizeRoomFeature({
      id: 'w',
      kind: 'wall',
      featureType: 'knee-wall',
    });
    expect(roomFeatureCategory(wall)).toBe('wall');
    expect(wall.wallType).toBe('knee');
  });
});

describe('Room Feature commands and projection', () => {
  it('adds, edits, and deletes through DESIGN-only command transactions', () => {
    const initial = designState();
    const feature = createRoomFeature(
      'room-new',
      'filler',
      { x: 10, y: 20, length: 6, depth: 24 },
    );

    const added = addRoomFeature('layout-kitchen', feature).reduce(initial);
    expect(added.session.selection).toEqual({
      kind: 'roomFeature',
      id: 'room-new',
    });

    const edited = updateRoomFeature(
      'layout-kitchen',
      'room-new',
      { x: 15.125, visible: false },
    ).reduce(added);
    expect(
      edited.project.layouts[0]?.roomFeatures.find(
        (item) => item.id === 'room-new',
      ),
    ).toMatchObject({
      x: 15.125,
      visible: false,
    });

    const deleted = deleteRoomFeature(
      'layout-kitchen',
      'room-new',
    ).reduce(edited);
    expect(
      deleted.project.layouts[0]?.roomFeatures.some(
        (item) => item.id === 'room-new',
      ),
    ).toBe(false);
    expect(deleted.session.selection).toEqual({ kind: 'none' });
  });

  it('keeps Room Feature mutation inert in SLAB', () => {
    const design = designState();
    const slab = setWorkspace('slab').reduce(design);
    const feature = createRoomFeature('room-new', 'base');

    expect(
      addRoomFeature('layout-kitchen', feature).reduce(slab),
    ).toBe(slab);
  });

  it('projects visible categories only and derives shared selection', () => {
    let state = designState();
    const layout = state.project.layouts[0]!;
    layout.roomFeatures.push(
      createRoomFeature(
        'wall-new',
        'wall',
        {
          kind: 'wall',
          wallType: 'full',
          x: 5,
          y: 5,
          length: 50,
          depth: 4,
        },
      ),
    );

    state = setSelection({
      kind: 'roomFeature',
      id: 'wall-new',
    }).reduce(state);

    const projection = createRoomFeatureCanvasProjection(state);
    expect(projection.items).toHaveLength(2);
    expect(
      projection.items.find((item) => item.id === 'wall-new')?.selected,
    ).toBe(true);
    expect(
      hitTestRoomFeatures(projection, { x: 10, y: 7 })?.id,
    ).toBe('wall-new');

    const hiddenWalls = {
      ...state,
      preferences: {
        ...state.preferences,
        showRoomWalls: false,
      },
    };
    expect(
      createRoomFeatureCanvasProjection(hiddenWalls).items.some(
        (item) => item.id === 'wall-new',
      ),
    ).toBe(false);
  });
});
