import {
  layoutToScreenRect,
  screenMmToViewport,
  type ElementLayout,
  type Point2,
  type ScreenFrame,
  type ScreenRect,
} from './screenSpace';
import { add, cross, length, normalize, scale, sub, vec3, type Vec3 } from './vec3';

export const MAX_VIEW_ANGLE_DEG = 75;
export const MIN_EYE_Z_MM = 100;
/** Reject a corner whose depth reaches past 75% of the eye's distance. */
export const MIN_DEPTH_RATIO = 0.25;
/** Bounds on the constant-apparent-size scale, so the text can't shrink away or fly off screen. */
export const MIN_APPARENT_SCALE = 0.5;
export const MAX_APPARENT_SCALE = 2.5;

export interface ProjectionOptions {
  /**
   * Keep the text's apparent (angular) size constant: at this eye distance it is
   * drawn at its layout size, and it grows or shrinks in proportion to distance.
   * Omit to keep the text's physical size.
   */
  referenceDistanceMm?: number;
}

/** Corners in order TL, TR, BR, BL. */
export type Quad<T> = [T, T, T, T];
/** Row-major 3×3. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

const Y_AXIS = vec3(0, 1, 0);
const isFiniteVec = (v: Vec3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

export function clampEye(eye: Vec3, center: Vec3): Vec3 {
  const d = sub(eye, center);
  const z = Math.max(d.z, MIN_EYE_Z_MM);
  const lateral = Math.hypot(d.x, d.y);
  const maxLateral = z * Math.tan((MAX_VIEW_ANGLE_DEG * Math.PI) / 180);
  const k = lateral > maxLateral ? maxLateral / lateral : 1;
  return vec3(center.x + d.x * k, center.y + d.y * k, center.z + z);
}

/** Scale that keeps the apparent size constant, clamped to [MIN_APPARENT_SCALE, MAX_APPARENT_SCALE]. */
export function apparentScale(distanceMm: number, referenceDistanceMm: number): number {
  return Math.min(MAX_APPARENT_SCALE, Math.max(MIN_APPARENT_SCALE, distanceMm / referenceDistanceMm));
}

/** A rectangle the size of the element, centred on it, turned to face the eye. */
export function billboardCorners(eye: Vec3, rect: ScreenRect): Quad<Vec3> {
  const n = normalize(sub(eye, rect.center));
  const u = normalize(cross(Y_AXIS, n));
  const v = cross(n, u);
  const hu = scale(u, rect.widthMm / 2);
  const hv = scale(v, rect.heightMm / 2);
  const c = rect.center;
  return [add(sub(c, hu), hv), add(add(c, hu), hv), sub(add(c, hu), hv), sub(sub(c, hu), hv)];
}

/** Where the ray from the eye through `q` meets the screen plane z = 0. */
export function projectToScreenPlane(eye: Vec3, q: Vec3): Vec3 {
  const t = eye.z / (eye.z - q.z);
  return add(eye, scale(sub(q, eye), t));
}

function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  // Gauss–Jordan elimination with partial pivoting on the augmented matrix.
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** The 3×3 homography (h33 = 1) mapping each `src` corner to the matching `dst` corner. */
export function solveHomography(src: Quad<Point2>, dst: Quad<Point2>): Mat3 | null {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    a.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  const h = solveLinear(a, b);
  if (!h) return null;
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function toMatrix3d(h: Mat3): string {
  const [h11, h12, h13, h21, h22, h23, h31, h32, h33] = h;
  const columns = [h11, h21, 0, h31, h12, h22, 0, h32, 0, 0, 1, 0, h13, h23, 0, h33];
  return `matrix3d(${columns.map((v) => v.toFixed(10)).join(', ')})`;
}

/** Where the element's corners must land (element-space px) to look flat from `eye`. */
export function projectedQuad(
  eye: Vec3,
  layout: ElementLayout,
  frame: ScreenFrame,
  options: ProjectionOptions = {},
): Quad<Point2> | null {
  if (!isFiniteVec(eye) || !(layout.width > 0 && layout.height > 0)) return null;
  const rect = layoutToScreenRect(layout, frame);
  const e = clampEye(eye, rect.center);
  const k =
    options.referenceDistanceMm === undefined
      ? 1
      : apparentScale(length(sub(e, rect.center)), options.referenceDistanceMm);
  const corners = billboardCorners(e, { ...rect, widthMm: rect.widthMm * k, heightMm: rect.heightMm * k });
  if (corners.some((q) => e.z - q.z < MIN_DEPTH_RATIO * e.z)) return null;
  return corners.map((q) => {
    const p = screenMmToViewport(projectToScreenPlane(e, q), frame);
    return { x: p.x - layout.left, y: p.y - layout.top };
  }) as Quad<Point2>;
}

export function computeCorrection(
  eye: Vec3,
  layout: ElementLayout,
  frame: ScreenFrame,
  options: ProjectionOptions = {},
): string | null {
  const dst = projectedQuad(eye, layout, frame, options);
  if (!dst) return null;
  const src: Quad<Point2> = [
    { x: 0, y: 0 },
    { x: layout.width, y: 0 },
    { x: layout.width, y: layout.height },
    { x: 0, y: layout.height },
  ];
  const h = solveHomography(src, dst);
  if (!h || !h.every(Number.isFinite)) return null;
  return toMatrix3d(h);
}

export function viewingStats(eye: Vec3, center: Vec3): { distanceMm: number; angleDeg: number } {
  const d = sub(eye, center);
  const distanceMm = length(d);
  const angleDeg = distanceMm === 0 ? 0 : (Math.acos(Math.min(1, Math.max(-1, d.z / distanceMm))) * 180) / Math.PI;
  return { distanceMm, angleDeg };
}
