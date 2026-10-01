import { vec3, type Vec3 } from '../geometry/vec3';

/** A landmark normalised to the frame (0..1 on both axes). */
export interface Landmark2D {
  x: number;
  y: number;
}

export interface EyeEstimateParams {
  frameWidthPx: number;
  frameHeightPx: number;
  hfovDeg: number;
  irisDiameterMm: number;
}

/** Centre first, then four ring points; opposite pairs are (1,3) and (2,4). */
export const RIGHT_IRIS = [468, 469, 470, 471, 472] as const;
export const LEFT_IRIS = [473, 474, 475, 476, 477] as const;
export const LANDMARK_COUNT = 478;

export function focalLengthPx(frameWidthPx: number, hfovDeg: number): number {
  return frameWidthPx / 2 / Math.tan((hfovDeg * Math.PI) / 360);
}

const toPx = (l: Landmark2D, w: number, h: number) => ({ x: l.x * w, y: l.y * h });

/**
 * The larger opposite-pair distance: independent of ring order and of
 * foreshortening along either axis.
 */
export function irisDiameterPx(lm: readonly Landmark2D[], ring: readonly number[], w: number, h: number): number {
  const [, a, b, c, d] = ring.map((i) => toPx(lm[i]!, w, h));
  return Math.max(Math.hypot(a!.x - c!.x, a!.y - c!.y), Math.hypot(b!.x - d!.x, b!.y - d!.y));
}

export function estimateEye(lm: readonly Landmark2D[], p: EyeEstimateParams): Vec3 | null {
  if (lm.length < LANDMARK_COUNT) return null;
  const w = p.frameWidthPx;
  const h = p.frameHeightPx;
  // Head yaw foreshortens the farther iris, so trust the larger one.
  const irisPx = Math.max(irisDiameterPx(lm, RIGHT_IRIS, w, h), irisDiameterPx(lm, LEFT_IRIS, w, h));
  if (!(irisPx > 0)) return null;

  const f = focalLengthPx(w, p.hfovDeg);
  const z = (f * p.irisDiameterMm) / irisPx;
  const mid = toPx(irisMidpoint(lm), w, h);
  return vec3(((mid.x - w / 2) * z) / f, ((mid.y - h / 2) * z) / f, z);
}

export function irisMidpoint(lm: readonly Landmark2D[]): Landmark2D {
  const r = lm[RIGHT_IRIS[0]]!;
  const l = lm[LEFT_IRIS[0]]!;
  return { x: (r.x + l.x) / 2, y: (r.y + l.y) / 2 };
}

function boxArea(face: readonly Landmark2D[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of face) {
    minX = Math.min(minX, l.x);
    minY = Math.min(minY, l.y);
    maxX = Math.max(maxX, l.x);
    maxY = Math.max(maxY, l.y);
  }
  return face.length === 0 ? 0 : (maxX - minX) * (maxY - minY);
}

/** The largest face is the nearest one — the person the demo is for. */
export function largestFace<T extends Landmark2D>(faces: readonly (readonly T[])[]): readonly T[] | null {
  let best: readonly T[] | null = null;
  let bestArea = -1;
  for (const face of faces) {
    const area = boxArea(face);
    if (area > bestArea) {
      best = face;
      bestArea = area;
    }
  }
  return best;
}
