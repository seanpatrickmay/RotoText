import { viewportToScreenMm, type ScreenFrame } from '../geometry/screenSpace';
import { vec3, type Vec3 } from '../geometry/vec3';

export const BOX_DEPTH_MM = 250;
export const GRID_MM = 25;
export const DISC_SEGMENTS = 48;
export const RING_RED = '#e5484d';
export const RING_WHITE = '#f4f1ea';
/** The page background (--bg in styles.css); distant discs fog toward it. */
export const FOG_BG = '#0e0f12';

export interface ViewportRectMm {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type Primitive =
  | { kind: 'line'; a: Vec3; b: Vec3; depth: number; role: 'grid' | 'stick' }
  | { kind: 'polygon'; points: Vec3[]; depth: number; fill: string };

/** Position as fractions of the viewport from its centre; depth z and radius r in mm. */
export interface TargetSpec {
  fx: number;
  fy: number;
  z: number;
  r: number;
}

export const TARGETS: readonly TargetSpec[] = [
  { fx: -0.3, fy: 0.2, z: -200, r: 18 },
  { fx: 0.25, fy: 0.28, z: -150, r: 16 },
  { fx: 0.05, fy: -0.05, z: -90, r: 20 },
  { fx: -0.18, fy: -0.3, z: -40, r: 14 },
  { fx: 0.35, fy: -0.22, z: -220, r: 22 },
  { fx: -0.38, fy: -0.05, z: -120, r: 15 },
  { fx: 0.12, fy: 0.12, z: 25, r: 12 },
  { fx: -0.08, fy: -0.18, z: 40, r: 12 },
];

const DISC_RADII = [1, 0.66, 0.33] as const;
const DISC_FILLS = [RING_RED, RING_WHITE, RING_RED] as const;

export function viewportRectMm(frame: ScreenFrame, innerWidth: number, innerHeight: number): ViewportRectMm {
  const tl = viewportToScreenMm({ x: 0, y: 0 }, frame);
  const br = viewportToScreenMm({ x: innerWidth, y: innerHeight }, frame);
  return { left: tl.x, right: br.x, top: tl.y, bottom: br.y };
}

export const rectCenter = (r: ViewportRectMm): Vec3 => vec3((r.left + r.right) / 2, (r.top + r.bottom) / 2, 0);

/** Positions every `step` from the low end, always including both ends. */
export function gridStops(a: number, b: number, step: number): number[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: number[] = [];
  for (let i = 0; lo + i * step < hi - 1e-9; i++) out.push(lo + i * step);
  out.push(hi);
  return out;
}

const line = (a: Vec3, b: Vec3, role: 'grid' | 'stick'): Primitive => ({
  kind: 'line',
  a,
  b,
  depth: (a.z + b.z) / 2,
  role,
});

const pointKey = (p: Vec3) => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;

function boxGrid(r: ViewportRectMm): Primitive[] {
  const D = -BOX_DEPTH_MM;
  const xs = gridStops(r.left, r.right, GRID_MM);
  const ys = gridStops(r.bottom, r.top, GRID_MM);
  const zs = gridStops(D, 0, GRID_MM);
  const out: Primitive[] = [];
  // Walls share edges; emit each segment once, whichever direction it is drawn.
  const seen = new Set<string>();
  const push = (a: Vec3, b: Vec3) => {
    const [lo, hi] = [pointKey(a), pointKey(b)].sort();
    const key = `${lo}|${hi}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(line(a, b, 'grid'));
  };
  // Back wall.
  for (const x of xs) push(vec3(x, r.bottom, D), vec3(x, r.top, D));
  for (const y of ys) push(vec3(r.left, y, D), vec3(r.right, y, D));
  // Floor and ceiling.
  for (const y of [r.bottom, r.top]) {
    for (const x of xs) push(vec3(x, y, 0), vec3(x, y, D));
    for (const z of zs) push(vec3(r.left, y, z), vec3(r.right, y, z));
  }
  // Side walls.
  for (const x of [r.left, r.right]) {
    for (const y of ys) push(vec3(x, y, 0), vec3(x, y, D));
    for (const z of zs) push(vec3(x, r.bottom, z), vec3(x, r.top, z));
  }
  return out;
}

function disc(c: Vec3, radius: number, fill: string): Primitive {
  const points: Vec3[] = [];
  for (let k = 0; k < DISC_SEGMENTS; k++) {
    const a = (2 * Math.PI * k) / DISC_SEGMENTS;
    points.push(vec3(c.x + radius * Math.cos(a), c.y + radius * Math.sin(a), c.z));
  }
  return { kind: 'polygon', points, depth: c.z, fill };
}

const byDepth = (a: Primitive, b: Primitive) => a.depth - b.depth;

/** The whole scene in painter's order: grid, then sticks, then discs, each far → near. */
export function buildTargetsScene(rect: ViewportRectMm): Primitive[] {
  const width = rect.right - rect.left;
  const height = rect.top - rect.bottom;
  const centre = rectCenter(rect);
  const sticks: Primitive[] = [];
  const discs: Primitive[] = [];
  for (const t of TARGETS) {
    const c = vec3(centre.x + t.fx * width, centre.y + t.fy * height, t.z);
    sticks.push(line(c, vec3(c.x, c.y, -BOX_DEPTH_MM), 'stick'));
    DISC_RADII.forEach((k, i) => discs.push(disc(c, t.r * k, DISC_FILLS[i]!)));
  }
  // Array.prototype.sort is stable, so each target's discs keep largest-first order.
  return [...boxGrid(rect).sort(byDepth), ...sticks.sort(byDepth), ...discs.sort(byDepth)];
}

export function depthOpacity(depth: number): number {
  return depth >= 0 ? 1 : 1 - 0.5 * Math.min(1, -depth / BOX_DEPTH_MM);
}

/** `hex` mixed toward FOG_BG by how much depthOpacity fades it; unchanged at or in front of the screen. */
export function fogColor(hex: string, depth: number): string {
  const k = 1 - depthOpacity(depth);
  const channel = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  let out = '#';
  for (let i = 0; i < 3; i++) {
    const v = Math.round(channel(hex, i) * (1 - k) + channel(FOG_BG, i) * k);
    out += v.toString(16).padStart(2, '0');
  }
  return out;
}

export function gridLineWidth(depth: number): number {
  const k = Math.min(1, Math.max(0, -depth / BOX_DEPTH_MM));
  return 1.5 - 0.75 * k;
}
