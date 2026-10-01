import { describe, expect, it } from 'vitest';
import { findPreset } from '../src/geometry/devices';
import type { ViewportEnv } from '../src/geometry/screenSpace';
import { buildScreenFrame, cameraOffset, DEFAULT_IRIS_DIAMETER_MM, settingsFromPreset } from '../src/settings';
import { DEFAULT_ONE_EURO } from '../src/tracking/smoothing';

const mbp14 = findPreset('mbp-14')!;
const env: ViewportEnv = {
  screenWidthPx: 1512,
  screenHeightPx: 982,
  isTouch: false,
  screenX: 0,
  screenY: 37,
  outerHeight: 982,
  innerHeight: 900,
  isFullscreen: false,
};

describe('settingsFromPreset', () => {
  it('copies preset geometry and fills defaults', () => {
    const s = settingsFromPreset(mbp14);
    expect(s).toEqual({
      presetId: 'mbp-14',
      screenWidthMm: mbp14.screenWidthMm,
      screenHeightMm: mbp14.screenHeightMm,
      cameraOffsetYMm: mbp14.cameraOffsetMm.y,
      cameraHfovDeg: mbp14.cameraHfovDeg,
      irisDiameterMm: DEFAULT_IRIS_DIAMETER_MM,
      viewportTopOffsetPx: null,
      minCutoff: DEFAULT_ONE_EURO.minCutoff,
      beta: DEFAULT_ONE_EURO.beta,
    });
  });
});

describe('buildScreenFrame', () => {
  it('derives mm per CSS px from the screen width and finds the viewport origin', () => {
    const frame = buildScreenFrame(settingsFromPreset(mbp14), env);
    expect(frame.mmPerPx).toBeCloseTo(302.4 / 1512, 12);
    expect(frame.screenWidthPx).toBe(1512);
    expect(frame.screenHeightPx).toBe(982);
    expect(frame.viewportOriginPx).toEqual({ x: 0, y: 37 + 82 });
  });

  it('applies the viewport top override', () => {
    const frame = buildScreenFrame({ ...settingsFromPreset(mbp14), viewportTopOffsetPx: 25 }, env);
    expect(frame.viewportOriginPx).toEqual({ x: 0, y: 25 });
  });
});

describe('cameraOffset', () => {
  it('centres the camera horizontally', () => {
    const s = settingsFromPreset(mbp14);
    expect(cameraOffset(s)).toEqual({ x: 0, y: s.cameraOffsetYMm });
  });
});
