import { describe, expect, it } from 'vitest';
import { viewportToScreenMm, type ScreenFrame } from '../../src/geometry/screenSpace';
import {
  clampDistance,
  MAX_MOUSE_DISTANCE_MM,
  MIN_MOUSE_DISTANCE_MM,
  MOUSE_GAIN,
  pointerToEye,
} from '../../src/ui/mouseMode';

const frame: ScreenFrame = { mmPerPx: 0.2, screenWidthPx: 1000, screenHeightPx: 800, viewportOriginPx: { x: 0, y: 0 } };
const viewport = { width: 1000, height: 800 };

describe('pointerToEye', () => {
  it('puts the eye straight in front of the viewport centre when the pointer is centred', () => {
    const eye = pointerToEye({ x: 500, y: 400 }, viewport, 500, frame);
    expect(eye.x).toBeCloseTo(0, 12);
    expect(eye.y).toBeCloseTo(0, 12);
    expect(eye.z).toBe(500);
  });

  it('exaggerates pointer offsets by the gain, with +y up', () => {
    const right = pointerToEye({ x: 600, y: 400 }, viewport, 500, frame);
    expect(right.x).toBeCloseTo(100 * 0.2 * MOUSE_GAIN, 9);
    const up = pointerToEye({ x: 500, y: 300 }, viewport, 500, frame);
    expect(up.y).toBeCloseTo(100 * 0.2 * MOUSE_GAIN, 9);
  });

  it('applies the gain about the viewport centre, not the screen origin', () => {
    const offsetFrame: ScreenFrame = { ...frame, viewportOriginPx: { x: 100, y: 50 } };
    const centre = viewportToScreenMm({ x: 500, y: 400 }, offsetFrame);
    const atCentre = pointerToEye({ x: 500, y: 400 }, viewport, 500, offsetFrame);
    expect(atCentre.x).toBe(centre.x);
    expect(atCentre.y).toBe(centre.y);
    const right = pointerToEye({ x: 600, y: 400 }, viewport, 500, offsetFrame);
    expect(right.x - centre.x).toBeCloseTo(100 * 0.2 * MOUSE_GAIN, 9);
    expect(right.y).toBe(centre.y);
  });

  it('clamps the distance', () => {
    expect(pointerToEye({ x: 500, y: 400 }, viewport, -50, frame).z).toBe(MIN_MOUSE_DISTANCE_MM);
  });
});

describe('clampDistance', () => {
  it('keeps the distance in range', () => {
    expect(clampDistance(50)).toBe(MIN_MOUSE_DISTANCE_MM);
    expect(clampDistance(700)).toBe(700);
    expect(clampDistance(5000)).toBe(MAX_MOUSE_DISTANCE_MM);
  });
});
