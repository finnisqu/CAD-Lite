import { describe, expect, it } from 'vitest';

import {
  ROOM_FEATURE_PRESETS,
  defaultRoomFeatureLabel,
  productionModeHudDescriptor,
} from '../src/browser';

describe('Batch 59 production Mode HUD parity', () => {
  it('restores annotation HUD identities and legacy help text', () => {
    expect(productionModeHudDescriptor('dimension')).toMatchObject({
      title: 'DIMENSION',
      shortcut: 'D',
      help: 'Click two points to place a dimension',
      kind: 'annotation',
    });
    expect(productionModeHudDescriptor('note')).toMatchObject({
      title: 'NOTE',
      shortcut: 'N',
      help: 'Click canvas to place a note',
      kind: 'annotation',
    });
    expect(productionModeHudDescriptor('line')).toMatchObject({
      title: 'LINE',
      shortcut: 'L',
      kind: 'annotation',
    });
  });

  it('models the Room Feature parent and wall HUD family separately', () => {
    expect(productionModeHudDescriptor('roomFeatures')).toMatchObject({
      title: 'ROOM FEATURES',
      shortcut: 'Q',
      kind: 'room-parent',
    });
    expect(productionModeHudDescriptor('roomWall')).toMatchObject({
      title: 'WALL',
      shortcut: null,
      kind: 'room-wall',
    });
    expect(productionModeHudDescriptor('linkedWall')).toMatchObject({
      title: 'LINKED WALLS',
      shortcut: 'W',
      kind: 'linked-wall',
    });
  });

  it('does not duplicate the already-specialized production HUDs', () => {
    expect(productionModeHudDescriptor('splash')).toBeNull();
    expect(productionModeHudDescriptor('radius')).toBeNull();
    expect(productionModeHudDescriptor('edgePainter')).toBeNull();
    expect(productionModeHudDescriptor('slabMove')).toBeNull();
  });

  it('retains the v1.5.99 Room Feature preset catalog and auto labels', () => {
    expect(ROOM_FEATURE_PRESETS).toHaveLength(13);
    expect(ROOM_FEATURE_PRESETS.map((preset) => preset.value)).toEqual([
      'base',
      'sinkBase',
      'vanityBase',
      'vanitySink',
      'customBase',
      'filler',
      'panel',
      'dwEndPanel',
      'dishwasher',
      'undercounterFridge',
      'cooktop',
      'range',
      'refrigerator',
    ]);
    const sinkBase = ROOM_FEATURE_PRESETS.find((preset) => preset.value === 'sinkBase');
    if (!sinkBase) throw new Error('Sink Base preset missing');
    expect(defaultRoomFeatureLabel(sinkBase, 42.5)).toBe('SB42.5');
  });
});
