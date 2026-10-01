import { lerp, vec3, type Vec3 } from '../geometry/vec3';
import { rectCenter, type ViewportRectMm } from '../scene/targets';
import type { LevelSpec } from './levels';

export const SOLUTION_DISTANCE_MM = 500;
export const SHAPE_HALF_FRACTION = 0.3;
export const SEGMENT_MM = 25;
export const BOX_MARGIN_MM = 5;
const MAX_DEPTH_STEP_MM = 60;
const DEPTH_TRIES = 20;

/** One straight segment: where it sits on the glass, and where it floats in the box. */
export interface Piece {
  glass: [Vec3, Vec3];
  lifted: [Vec3, Vec3];
}

export interface BuiltLevel {
  solutionEye: Vec3;
  pieces: Piece[];
}

/** Small seeded PRNG (mulberry32): the same seed always gives the same level. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split a→b evenly into the fewest pieces no longer than maxLen. */
export function splitEdge(a: Vec3, b: Vec3, maxLen: number): [Vec3, Vec3][] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / maxLen - 1e-9));
  const out: [Vec3, Vec3][] = [];
  for (let j = 0; j < n; j++) out.push([lerp(a, b, j / n), lerp(a, b, (j + 1) / n)]);
  return out;
}

/** The point at `depth` mm behind the glass on the ray from `eye` through glass point `p`. */
export function liftPoint(p: Vec3, eye: Vec3, depth: number): Vec3 {
  const k = depth / eye.z;
  return vec3(p.x + (p.x - eye.x) * k, p.y + (p.y - eye.y) * k, -depth);
}

/** Largest depth along the ray (one axis) that keeps the coordinate within [lo, hi]. */
function maxDepthOnAxis(p: number, e: number, ez: number, lo: number, hi: number): number {
  const k = (p - e) / ez;
  if (k > 0) return (hi - p) / k;
  if (k < 0) return (lo - p) / k;
  return Infinity;
}

/**
 * Cut the outline into short segments and float each one, at its own depth, along its
 * rays from the solution eye — so from there (and only there) they form the outline.
 */
export function buildLevel(level: LevelSpec, rect: ViewportRectMm): BuiltLevel {
  const centre = rectCenter(rect);
  const half = SHAPE_HALF_FRACTION * Math.min(rect.right - rect.left, rect.top - rect.bottom);
  const eye = vec3(centre.x + level.offset.x, centre.y + level.offset.y, SOLUTION_DISTANCE_MM);
  const random = mulberry32(level.seed);
  const span = level.depthMax - level.depthMin;
  const minStep = Math.min(MAX_DEPTH_STEP_MM, 0.5 * span);
  const left = rect.left + BOX_MARGIN_MM;
  const right = rect.right - BOX_MARGIN_MM;
  const bottom = rect.bottom + BOX_MARGIN_MM;
  const top = rect.top - BOX_MARGIN_MM;

  const pieces: Piece[] = [];
  let prev: number | null = null;
  for (const line of level.outline) {
    const glass = line.map((u) => vec3(centre.x + u.x * half, centre.y + u.y * half, 0));
    for (let i = 0; i + 1 < glass.length; i++) {
      for (const [p1, p2] of splitEdge(glass[i]!, glass[i + 1]!, SEGMENT_MM)) {
        // Neighbours at clearly different depths make the breaks visible off-solution.
        let depth = level.depthMin;
        for (let t = 0; t < DEPTH_TRIES; t++) {
          depth = level.depthMin + span * random();
          if (prev === null || Math.abs(depth - prev) >= minStep) break;
        }
        prev = depth;
        // Off-centre rays diverge with depth: pull the piece forward until it fits the box.
        for (const p of [p1, p2]) {
          depth = Math.min(
            depth,
            maxDepthOnAxis(p.x, eye.x, eye.z, left, right),
            maxDepthOnAxis(p.y, eye.y, eye.z, bottom, top),
          );
        }
        depth = Math.max(depth, level.depthMin);
        pieces.push({ glass: [p1, p2], lifted: [liftPoint(p1, eye, depth), liftPoint(p2, eye, depth)] });
      }
    }
  }
  return { solutionEye: eye, pieces };
}

/** The piece part-way through its solve flight: t = 0 floating, t = 1 on the glass. */
export function pieceAt(piece: Piece, t: number): [Vec3, Vec3] {
  return [lerp(piece.lifted[0], piece.glass[0], t), lerp(piece.lifted[1], piece.glass[1], t)];
}
