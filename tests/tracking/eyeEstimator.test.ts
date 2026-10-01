import { describe, expect, it } from 'vitest';
import { vec3, type Vec3 } from '../../src/geometry/vec3';
import {
  estimateEye,
  focalLengthPx,
  irisMidpoint,
  largerIrisDiameterPx,
  LANDMARK_COUNT,
  largestFace,
  LEFT_IRIS,
  RIGHT_IRIS,
  type EyeEstimateParams,
  type Landmark2D,
} from '../../src/tracking/eyeEstimator';

const landscape: EyeEstimateParams = { frameWidthPx: 640, frameHeightPx: 480, hfovDeg: 70, irisDiameterMm: 11.7 };
const portrait: EyeEstimateParams = { frameWidthPx: 480, frameHeightPx: 640, hfovDeg: 55, irisDiameterMm: 11.7 };

interface Squash {
  sx: number;
  sy: number;
}

/** Build a 478-point landmark list with both irises projected from a known eye position. */
function synthLandmarks(eye: Vec3, p: EyeEstimateParams, opts: { right?: Squash; left?: Squash } = {}): Landmark2D[] {
  const w = p.frameWidthPx;
  const h = p.frameHeightPx;
  const f = focalLengthPx(w, p.hfovDeg);
  const lm: Landmark2D[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5 }));
  const place = (ring: readonly number[], cx: number, s: Squash) => {
    const u = (f * cx) / eye.z + w / 2;
    const v = (f * eye.y) / eye.z + h / 2;
    const r = (f * p.irisDiameterMm) / 2 / eye.z;
    const pts: [number, number][] = [
      [u, v],
      [u + r * s.sx, v],
      [u, v + r * s.sy],
      [u - r * s.sx, v],
      [u, v - r * s.sy],
    ];
    ring.forEach((idx, i) => {
      const [px, py] = pts[i]!;
      lm[idx] = { x: px / w, y: py / h };
    });
  };
  const ipd = 63;
  place(RIGHT_IRIS, eye.x - ipd / 2, opts.right ?? { sx: 1, sy: 1 });
  place(LEFT_IRIS, eye.x + ipd / 2, opts.left ?? { sx: 1, sy: 1 });
  return lm;
}

function expectVecClose(actual: Vec3 | null, expected: Vec3, tol = 1e-6) {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual!.x - expected.x)).toBeLessThan(tol);
  expect(Math.abs(actual!.y - expected.y)).toBeLessThan(tol);
  expect(Math.abs(actual!.z - expected.z)).toBeLessThan(tol);
}

describe('focalLengthPx', () => {
  it('is half the width at 90° HFOV', () => {
    expect(focalLengthPx(640, 90)).toBeCloseTo(320, 9);
  });
});

describe('estimateEye', () => {
  it('recovers a known eye position (landscape frame)', () => {
    const eye = vec3(40, -25, 450);
    expectVecClose(estimateEye(synthLandmarks(eye, landscape), landscape), eye);
  });

  it('recovers a known eye position from a portrait iPhone frame', () => {
    const eye = vec3(-20, 35, 300);
    expectVecClose(estimateEye(synthLandmarks(eye, portrait), portrait), eye);
  });

  it('is unaffected by one axis of an iris being foreshortened', () => {
    const eye = vec3(10, 5, 500);
    const lm = synthLandmarks(eye, landscape, { right: { sx: 0.5, sy: 1 }, left: { sx: 1, sy: 0.6 } });
    expectVecClose(estimateEye(lm, landscape), eye);
  });

  it('uses the larger of the two irises', () => {
    const eye = vec3(0, 0, 400);
    const lm = synthLandmarks(eye, landscape, { left: { sx: 0.8, sy: 0.8 } });
    expectVecClose(estimateEye(lm, landscape), eye);
  });

  it('returns null without the iris landmarks', () => {
    expect(estimateEye(synthLandmarks(vec3(0, 0, 400), landscape).slice(0, 468), landscape)).toBeNull();
  });

  it('returns null for a zero-size iris', () => {
    const lm: Landmark2D[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5 }));
    expect(estimateEye(lm, landscape)).toBeNull();
  });
});

describe('irisMidpoint', () => {
  it('is the normalised midpoint of the two iris centres', () => {
    const lm: Landmark2D[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0, y: 0 }));
    lm[468] = { x: 0.4, y: 0.5 };
    lm[473] = { x: 0.6, y: 0.7 };
    const m = irisMidpoint(lm);
    expect(m.x).toBeCloseTo(0.5, 12);
    expect(m.y).toBeCloseTo(0.6, 12);
  });
});

describe('largestFace', () => {
  const box = (x0: number, y0: number, x1: number, y1: number): Landmark2D[] => [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
  ];

  it('picks the face with the largest bounding box', () => {
    const small = box(0.4, 0.4, 0.6, 0.6);
    const big = box(0.2, 0.2, 0.8, 0.8);
    expect(largestFace([small, big])).toBe(big);
    expect(largestFace([big, small])).toBe(big);
  });

  it('returns null when there are no faces', () => {
    expect(largestFace([])).toBeNull();
  });
});

describe('largerIrisDiameterPx', () => {
  it('is the diameter of the larger iris', () => {
    const eye = vec3(0, 0, 400);
    const lm = synthLandmarks(eye, landscape, { left: { sx: 0.8, sy: 0.8 } });
    const expected = (focalLengthPx(landscape.frameWidthPx, landscape.hfovDeg) * landscape.irisDiameterMm) / eye.z;
    expect(largerIrisDiameterPx(lm, landscape.frameWidthPx, landscape.frameHeightPx)).toBeCloseTo(expected, 9);
  });

  it('is 0 without the iris landmarks', () => {
    expect(largerIrisDiameterPx(synthLandmarks(vec3(0, 0, 400), landscape).slice(0, 468), 640, 480)).toBe(0);
  });
});
