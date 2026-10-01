import { describe, expect, it } from 'vitest';
import {
  cameraToScreen,
  estimateViewportOrigin,
  IPHONE_STATUS_BAR_PX,
  layoutToScreenRect,
  screenMmToViewport,
  viewportToScreenMm,
  type ScreenFrame,
  type ViewportEnv,
} from '../../src/geometry/screenSpace';
import { vec3 } from '../../src/geometry/vec3';

const frame: ScreenFrame = { mmPerPx: 0.2, screenWidthPx: 1000, screenHeightPx: 800, viewportOriginPx: { x: 0, y: 0 } };

const desktopEnv: ViewportEnv = {
  screenWidthPx: 1512,
  screenHeightPx: 982,
  isTouch: false,
  screenX: 100,
  screenY: 40,
  outerHeight: 900,
  innerHeight: 820,
  isFullscreen: false,
};

describe('cameraToScreen', () => {
  it('maps a viewer up-and-right of the camera (their view) to +x and +y', () => {
    // The front camera sees the viewer's right as image-left (−X) and up as image-up (−Y).
    expect(cameraToScreen(vec3(-50, -30, 400), { x: 0, y: 95 })).toEqual(vec3(50, 125, 400));
  });

  it('maps a viewer down-and-left to −x and below the camera', () => {
    const e = cameraToScreen(vec3(40, 60, 300), { x: 0, y: 95 });
    expect(e.x).toBe(-40);
    expect(e.y).toBe(35);
    expect(e.z).toBe(300);
  });
});

describe('estimateViewportOrigin', () => {
  it('uses window position plus browser chrome on desktop', () => {
    expect(estimateViewportOrigin(desktopEnv, null)).toEqual({ x: 100, y: 120 });
  });

  it('uses the status bar height on iPhone', () => {
    const env: ViewportEnv = { ...desktopEnv, isTouch: true, screenX: 0, screenY: 0 };
    expect(estimateViewportOrigin(env, null)).toEqual({ x: 0, y: IPHONE_STATUS_BAR_PX });
  });

  it('is exactly the screen origin in fullscreen', () => {
    expect(estimateViewportOrigin({ ...desktopEnv, isFullscreen: true }, null)).toEqual({ x: 0, y: 0 });
  });

  it('lets the debug override replace only the top offset', () => {
    expect(estimateViewportOrigin(desktopEnv, 30)).toEqual({ x: 100, y: 30 });
  });
});

describe('viewport ↔ screen mm', () => {
  it('puts the screen centre at the origin and +y up', () => {
    expect(viewportToScreenMm({ x: 500, y: 400 }, frame)).toEqual(vec3(0, 0, 0));
    expect(viewportToScreenMm({ x: 0, y: 0 }, frame)).toEqual(vec3(-100, 80, 0));
  });

  it('accounts for the viewport origin', () => {
    const offset: ScreenFrame = { ...frame, viewportOriginPx: { x: 100, y: 50 } };
    expect(viewportToScreenMm({ x: 400, y: 350 }, offset)).toEqual(vec3(0, 0, 0));
  });

  it('round-trips', () => {
    const offset: ScreenFrame = { ...frame, viewportOriginPx: { x: 37, y: 91 } };
    const back = screenMmToViewport(viewportToScreenMm({ x: 123.5, y: 456.25 }, offset), offset);
    expect(back.x).toBeCloseTo(123.5, 9);
    expect(back.y).toBeCloseTo(456.25, 9);
  });
});

describe('layoutToScreenRect', () => {
  it('converts a centred element to a mm rect at the origin', () => {
    const r = layoutToScreenRect({ left: 400, top: 350, width: 200, height: 100 }, frame);
    expect(r.center).toEqual(vec3(0, 0, 0));
    expect(r.widthMm).toBeCloseTo(40, 9);
    expect(r.heightMm).toBeCloseTo(20, 9);
  });
});
