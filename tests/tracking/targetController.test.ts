import { describe, expect, it } from 'vitest';
import { vec3, type Vec3 } from '../../src/geometry/vec3';
import {
  EASE_DURATION_MS,
  FACE_LOST_DELAY_MS,
  initialTargetState,
  REACQUIRE_BLEND_MS,
  updateTarget,
  type TargetState,
} from '../../src/tracking/targetController';

const REST = vec3(0, 0, 500);
const SEEN = vec3(200, 40, 400);

function expectVecClose(a: Vec3, b: Vec3) {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
}

/** State after seeing SEEN at t = 1000 from a fresh start. */
function seenAt1000(): TargetState {
  return updateTarget(initialTargetState(), SEEN, 1000, REST).state;
}

describe('updateTarget', () => {
  it('rests with status lost before any face is seen', () => {
    const step = updateTarget(initialTargetState(), null, 0, REST);
    expect(step.target).toEqual(REST);
    expect(step.status).toBe('lost');
  });

  it('follows the measurement while tracking', () => {
    const step = updateTarget(initialTargetState(), SEEN, 1000, REST);
    expect(step.target).toEqual(SEEN);
    expect(step.status).toBe('tracking');
  });

  it('holds the last eye exactly through a brief dropout', () => {
    const s = seenAt1000();
    const early = updateTarget(s, null, 1000 + 200, REST);
    expect(early.target).toEqual(SEEN);
    expect(early.status).toBe('holding');
    const edge = updateTarget(s, null, 1000 + FACE_LOST_DELAY_MS, REST);
    expect(edge.target).toEqual(SEEN);
  });

  it('returns to tracking after a brief dropout without blending', () => {
    const s = updateTarget(seenAt1000(), null, 1200, REST).state;
    const back = updateTarget(s, vec3(210, 40, 400), 1250, REST);
    expect(back.target).toEqual(vec3(210, 40, 400));
    expect(back.status).toBe('tracking');
  });

  it('eases toward rest after the delay, reaching it after the ease duration', () => {
    const s = seenAt1000();
    const half = updateTarget(s, null, 1000 + FACE_LOST_DELAY_MS + EASE_DURATION_MS / 2, REST);
    expect(half.status).toBe('lost');
    expectVecClose(half.target, vec3(100, 20, 450)); // smoothstep(0.5) = 0.5
    const done = updateTarget(s, null, 1000 + FACE_LOST_DELAY_MS + EASE_DURATION_MS + 1, REST);
    expect(done.target).toEqual(REST);
  });

  it('blends from the last output when a face is reacquired after being lost', () => {
    let s = seenAt1000();
    s = updateTarget(s, null, 3000, REST).state; // long gone → output is REST
    const fresh = vec3(-100, 0, 300);
    const first = updateTarget(s, fresh, 3100, REST);
    expect(first.status).toBe('tracking');
    expectVecClose(first.target, REST);
    const mid = updateTarget(first.state, fresh, 3100 + REACQUIRE_BLEND_MS / 2, REST);
    expectVecClose(mid.target, vec3(-50, 0, 400));
    const end = updateTarget(mid.state, fresh, 3100 + REACQUIRE_BLEND_MS, REST);
    expect(end.target).toEqual(fresh);
  });

  it('blends in from rest when the first face appears after resting output', () => {
    const resting = updateTarget(initialTargetState(), null, 0, REST).state;
    const first = updateTarget(resting, SEEN, 100, REST);
    expectVecClose(first.target, REST);
  });
});
