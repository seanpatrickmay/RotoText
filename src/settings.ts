import type { DevicePreset } from './geometry/devices';
import { estimateViewportOrigin, type Point2, type ScreenFrame, type ViewportEnv } from './geometry/screenSpace';
import { DEFAULT_ONE_EURO } from './tracking/smoothing';

export const DEFAULT_IRIS_DIAMETER_MM = 11.7;

/** Everything the debug panel can tune. Starts from a device preset. */
export interface Settings {
  presetId: string;
  screenWidthMm: number;
  screenHeightMm: number;
  cameraOffsetYMm: number;
  cameraHfovDeg: number;
  irisDiameterMm: number;
  /** null = estimate from the browser. */
  viewportTopOffsetPx: number | null;
  minCutoff: number;
  beta: number;
}

export function settingsFromPreset(p: DevicePreset): Settings {
  return {
    presetId: p.id,
    screenWidthMm: p.screenWidthMm,
    screenHeightMm: p.screenHeightMm,
    cameraOffsetYMm: p.cameraOffsetMm.y,
    cameraHfovDeg: p.cameraHfovDeg,
    irisDiameterMm: DEFAULT_IRIS_DIAMETER_MM,
    viewportTopOffsetPx: null,
    minCutoff: DEFAULT_ONE_EURO.minCutoff,
    beta: DEFAULT_ONE_EURO.beta,
  };
}

export function buildScreenFrame(s: Settings, env: ViewportEnv): ScreenFrame {
  return {
    mmPerPx: s.screenWidthMm / env.screenWidthPx,
    screenWidthPx: env.screenWidthPx,
    screenHeightPx: env.screenHeightPx,
    viewportOriginPx: estimateViewportOrigin(env, s.viewportTopOffsetPx),
  };
}

export const cameraOffset = (s: Settings): Point2 => ({ x: 0, y: s.cameraOffsetYMm });
