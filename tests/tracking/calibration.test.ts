import { describe, expect, it } from 'vitest';
import { focalLengthPx } from '../../src/tracking/eyeEstimator';
import {
  CALIBRATION_DISTANCE_MM,
  hfovFromIris,
  median,
  MIN_CALIBRATION_SAMPLES,
} from '../../src/tracking/calibration';

const W = 1280;
/** The iris size a camera with this HFOV would see at the calibration distance. */
const irisPxFor = (hfovDeg: number) => (focalLengthPx(W, hfovDeg) * 11.7) / CALIBRATION_DISTANCE_MM;

describe('median', () => {
  it('handles odd and even counts without mutating the input', () => {
    const values = [5, 1, 3];
    expect(median(values)).toBe(3);
    expect(values).toEqual([5, 1, 3]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('hfovFromIris', () => {
  it('recovers a known field of view', () => {
    const samples = Array.from({ length: 20 }, () => irisPxFor(63.5));
    expect(hfovFromIris(samples, W)).toBeCloseTo(63.5, 1);
  });

  it('is not moved by one outlier frame', () => {
    const samples = [...Array.from({ length: 19 }, () => irisPxFor(70)), irisPxFor(70) * 3];
    expect(hfovFromIris(samples, W)).toBeCloseTo(70, 1);
  });

  it('ignores zero and non-finite samples from blinks or dropped detections', () => {
    const good = Array.from({ length: MIN_CALIBRATION_SAMPLES }, () => irisPxFor(60));
    expect(hfovFromIris([...good, 0, 0, 0, NaN, Infinity, -4], W)).toBeCloseTo(60, 1);
    expect(hfovFromIris([...good.slice(1), 0, NaN], W)).toBeNull();
  });

  it('needs at least the minimum number of samples', () => {
    expect(hfovFromIris(Array.from({ length: MIN_CALIBRATION_SAMPLES - 1 }, () => irisPxFor(65)), W)).toBeNull();
    expect(hfovFromIris([], W)).toBeNull();
  });

  it('rejects results outside 30–120°', () => {
    expect(hfovFromIris(Array.from({ length: 20 }, () => irisPxFor(25)), W)).toBeNull();
    expect(hfovFromIris(Array.from({ length: 20 }, () => irisPxFor(130)), W)).toBeNull();
  });
});
