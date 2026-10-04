import { describe, expect, it } from 'vitest';

import {
  CAD_LITE_ARCHITECTURE_VERSION,
  CAD_LITE_BEHAVIOR_BASELINE,
  getBuildInfo,
} from '../src/app/build-info';

describe('architecture scaffold', () => {
  it('identifies the architecture build and frozen behavior baseline', () => {
    expect(getBuildInfo()).toEqual({
      architectureVersion: CAD_LITE_ARCHITECTURE_VERSION,
      behaviorBaseline: CAD_LITE_BEHAVIOR_BASELINE,
    });
    expect(CAD_LITE_ARCHITECTURE_VERSION).toBe('1.6.0');
    expect(CAD_LITE_BEHAVIOR_BASELINE).toBe('v1.5.99');
  });
});
