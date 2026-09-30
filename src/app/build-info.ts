export const CAD_LITE_ARCHITECTURE_VERSION = '1.6.0-dev.0' as const;
export const CAD_LITE_BEHAVIOR_BASELINE = 'v1.5.99' as const;

export interface BuildInfo {
  architectureVersion: typeof CAD_LITE_ARCHITECTURE_VERSION;
  behaviorBaseline: typeof CAD_LITE_BEHAVIOR_BASELINE;
}

export function getBuildInfo(): BuildInfo {
  return {
    architectureVersion: CAD_LITE_ARCHITECTURE_VERSION,
    behaviorBaseline: CAD_LITE_BEHAVIOR_BASELINE,
  };
}
