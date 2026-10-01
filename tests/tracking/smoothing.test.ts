import { describe, expect, it } from 'vitest';
import { vec3, type Vec3 } from '../../src/geometry/vec3';
import { DEFAULT_ONE_EURO, OneEuroFilter3 } from '../../src/tracking/smoothing';
import { nextDetectorTimestamp } from '../../src/tracking/timestamps';

const FRAME_MS = 1000 / 30;
const isFiniteVec = (v: Vec3) => [v.x, v.y, v.z].every(Number.isFinite);

describe('OneEuroFilter3', () => {
  it('passes the first sample through', () => {
    const f = new OneEuroFilter3(DEFAULT_ONE_EURO);
    expect(f.filter(vec3(1, 2, 3), 0)).toEqual(vec3(1, 2, 3));
  });

  it('keeps a constant input constant', () => {
    const f = new OneEuroFilter3(DEFAULT_ONE_EURO);
    for (let i = 0; i < 60; i++) expect(f.filter(vec3(10, -5, 500), i * FRAME_MS)).toEqual(vec3(10, -5, 500));
  });

  it('converges after a step within two seconds', () => {
    const f = new OneEuroFilter3(DEFAULT_ONE_EURO);
    let t = 0;
    for (let i = 0; i < 30; i++, t += FRAME_MS) f.filter(vec3(0, 0, 500), t);
    let out = vec3(0, 0, 0);
    for (let i = 0; i < 60; i++, t += FRAME_MS) out = f.filter(vec3(100, 0, 500), t);
    expect(Math.abs(out.x - 100)).toBeLessThan(1);
  });

  it('lags behind a step on the first frame (it actually smooths)', () => {
    const f = new OneEuroFilter3(DEFAULT_ONE_EURO);
    f.filter(vec3(0, 0, 500), 0);
    const out = f.filter(vec3(100, 0, 500), FRAME_MS);
    expect(out.x).toBeGreaterThan(0);
    expect(out.x).toBeLessThan(100);
  });

  it('ignores repeated or backwards timestamps without producing NaN', () => {
    const f = new OneEuroFilter3(DEFAULT_ONE_EURO);
    f.filter(vec3(0, 0, 500), 0);
    const a = f.filter(vec3(50, 0, 500), 1000);
    const same = f.filter(vec3(80, 0, 500), 1000);
    const back = f.filter(vec3(90, 0, 500), 900);
    expect(same).toEqual(a);
    expect(back).toEqual(a);
    expect(isFiniteVec(f.filter(vec3(60, 0, 500), 1100))).toBe(true);
  });

  it('ignores non-finite input', () => {
    const f = new OneEuroFilter3(DEFAULT_ONE_EURO);
    const a = f.filter(vec3(5, 5, 400), 0);
    expect(f.filter(vec3(NaN, 0, 400), FRAME_MS)).toEqual(a);
    expect(isFiniteVec(f.filter(vec3(6, 5, 400), 2 * FRAME_MS))).toBe(true);
  });

  it('forgets history on reset', () => {
    const f = new OneEuroFilter3(DEFAULT_ONE_EURO);
    f.filter(vec3(0, 0, 500), 0);
    f.reset();
    expect(f.filter(vec3(100, 0, 300), FRAME_MS)).toEqual(vec3(100, 0, 300));
  });
});

describe('nextDetectorTimestamp', () => {
  it('passes increasing timestamps through and bumps repeats or regressions', () => {
    expect(nextDetectorTimestamp(null, 5)).toBe(5);
    expect(nextDetectorTimestamp(10, 20)).toBe(20);
    expect(nextDetectorTimestamp(10, 10)).toBe(11);
    expect(nextDetectorTimestamp(10, 3)).toBe(11);
  });
});
