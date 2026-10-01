import { lerp, type Vec3 } from '../geometry/vec3';

export const FACE_LOST_DELAY_MS = 300;
export const EASE_DURATION_MS = 500;
export const REACQUIRE_BLEND_MS = 300;

export type TargetStatus = 'tracking' | 'holding' | 'lost';

export interface TargetState {
  lastSeenEye: Vec3 | null;
  lastSeenMs: number;
  lastOutput: Vec3 | null;
  blendFrom: Vec3 | null;
  blendStartMs: number;
}

export interface TargetStep {
  target: Vec3;
  status: TargetStatus;
  state: TargetState;
}

export const initialTargetState = (): TargetState => ({
  lastSeenEye: null,
  lastSeenMs: -Infinity,
  lastOutput: null,
  blendFrom: null,
  blendStartMs: 0,
});

const smoothstep = (k: number) => k * k * (3 - 2 * k);

export function updateTarget(state: TargetState, measured: Vec3 | null, nowMs: number, restingEye: Vec3): TargetStep {
  if (measured) {
    const wasLost = state.lastSeenEye === null || nowMs - state.lastSeenMs > FACE_LOST_DELAY_MS;
    let { blendFrom, blendStartMs } = state;
    if (wasLost && state.lastOutput) {
      blendFrom = state.lastOutput;
      blendStartMs = nowMs;
    }
    let target = measured;
    if (blendFrom) {
      const k = (nowMs - blendStartMs) / REACQUIRE_BLEND_MS;
      if (k >= 1) blendFrom = null;
      else target = lerp(blendFrom, measured, smoothstep(k));
    }
    return {
      target,
      status: 'tracking',
      state: { lastSeenEye: measured, lastSeenMs: nowMs, lastOutput: target, blendFrom, blendStartMs },
    };
  }

  let target: Vec3;
  let status: TargetStatus;
  const lostForMs = nowMs - state.lastSeenMs;
  if (!state.lastSeenEye) {
    target = restingEye;
    status = 'lost';
  } else if (lostForMs <= FACE_LOST_DELAY_MS) {
    target = state.lastSeenEye;
    status = 'holding';
  } else {
    const k = Math.min(1, (lostForMs - FACE_LOST_DELAY_MS) / EASE_DURATION_MS);
    target = k >= 1 ? restingEye : lerp(state.lastSeenEye, restingEye, smoothstep(k));
    status = 'lost';
  }
  return { target, status, state: { ...state, lastOutput: target, blendFrom: null } };
}
