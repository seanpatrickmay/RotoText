import { describe, expect, it } from 'vitest';
import { vec3, type Vec3 } from '../../src/geometry/vec3';
import {
  DEFAULT_DEPTH_ONE_EURO,
  DEFAULT_ONE_EURO,
  easeToward,
  OneEuroFilter1,
  OneEuroFilter3,
} from '../../src/tracking/smoothing';
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

describe('OneEuroFilter1', () => {
  it('passes the first sample through and keeps a constant input constant', () => {
    const f = new OneEuroFilter1(DEFAULT_DEPTH_ONE_EURO);
    for (let i = 0; i < 30; i++) expect(f.filter(21.4, i * FRAME_MS)).toBe(21.4);
  });

  it('cuts sample-to-sample jitter of a still iris by at least 4x', () => {
    const f = new OneEuroFilter1(DEFAULT_DEPTH_ONE_EURO);
    const out: number[] = [];
    // Alternating ±0.5 px: the worst case for a frame-to-frame jump.
    for (let i = 0; i < 120; i++) out.push(f.filter(21.4 + (i % 2 ? 0.5 : -0.5), i * FRAME_MS));
    const settled = out.slice(60);
    const maxJump = Math.max(...settled.slice(1).map((v, i) => Math.abs(v - settled[i]!)));
    expect(maxJump).toBeLessThan(1 / 4);
  });

  it('follows a real change in distance within two seconds', () => {
    const f = new OneEuroFilter1(DEFAULT_DEPTH_ONE_EURO);
    let t = 0;
    for (let i = 0; i < 30; i++, t += FRAME_MS) f.filter(21.4, t);
    let out = 0;
    for (let i = 0; i < 60; i++, t += FRAME_MS) out = f.filter(30, t);
    expect(Math.abs(out - 30)).toBeLessThan(0.3);
  });

  it('ignores repeated, backwards and non-finite samples, and forgets on reset', () => {
    const f = new OneEuroFilter1(DEFAULT_DEPTH_ONE_EURO);
    f.filter(20, 0);
    const a = f.filter(22, 100);
    expect(f.filter(30, 100)).toBe(a);
    expect(f.filter(30, 50)).toBe(a);
    expect(f.filter(NaN, 200)).toBe(a);
    expect(Number.isFinite(f.filter(21, 300))).toBe(true);
    f.reset();
    expect(f.filter(25, 400)).toBe(25);
  });
});

describe('easeToward', () => {
  it('moves part of the way, more for a longer step, and never overshoots', () => {
    const from = vec3(0, 0, 500);
    const goal = vec3(100, -50, 400);
    const short = easeToward(from, goal, 8, 30);
    const long = easeToward(from, goal, 33, 30);
    expect(short.x).toBeGreaterThan(0);
    expect(short.x).toBeLessThan(long.x);
    expect(long.x).toBeLessThan(100);
    expect(long.z).toBeGreaterThan(400);
  });

  it('is frame-rate independent: two half steps equal one full step', () => {
    const from = vec3(0, 0, 500);
    const goal = vec3(100, 0, 500);
    const once = easeToward(from, goal, 16, 30);
    const twice = easeToward(easeToward(from, goal, 8, 30), goal, 8, 30);
    expect(twice.x).toBeCloseTo(once.x, 9);
  });

  it('holds still for a zero or negative step and snaps for a non-positive time constant', () => {
    const from = vec3(1, 2, 3);
    const goal = vec3(4, 5, 6);
    expect(easeToward(from, goal, 0, 30)).toEqual(from);
    expect(easeToward(from, goal, -5, 30)).toEqual(from);
    expect(easeToward(from, goal, 16, 0)).toEqual(goal);
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
