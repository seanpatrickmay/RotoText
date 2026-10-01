import type { Point2 } from '../geometry/screenSpace';

/** A shape as polylines in unit coordinates (x, y in [-1, 1], +y up). */
export type Outline = Point2[][];

const pts = (coords: ReadonlyArray<readonly [number, number]>): Point2[] => coords.map(([x, y]) => ({ x, y }));

/** A closed regular polygon: n + 1 points, the last repeating the first. */
export function circle(n: number, r: number, cx = 0, cy = 0): Point2[] {
  const out: Point2[] = [];
  for (let k = 0; k <= n; k++) {
    const a = (2 * Math.PI * k) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

function star(): Point2[] {
  const out: Point2[] = [];
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI / 2 + (Math.PI * k) / 5;
    const r = k % 2 === 0 ? 1 : 0.4;
    out.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return out;
}

/** A chamfered O, 0.4 wide and 0.7 tall, left edge at x0. */
const letterO = (x0: number): Point2[] =>
  pts([
    [0.1, -0.35],
    [0.3, -0.35],
    [0.4, -0.25],
    [0.4, 0.25],
    [0.3, 0.35],
    [0.1, 0.35],
    [0, 0.25],
    [0, -0.25],
    [0.1, -0.35],
  ]).map((p) => ({ x: x0 + p.x, y: p.y }));

export const RING: Outline = [circle(32, 1)];

export const TRIANGLE: Outline = [
  pts([
    [0, 1],
    [-Math.sqrt(3) / 2, -0.5],
    [Math.sqrt(3) / 2, -0.5],
    [0, 1],
  ]),
];

export const ARROW: Outline = [
  pts([
    [-1, -0.3],
    [0.2, -0.3],
    [0.2, -0.7],
    [1, 0],
    [0.2, 0.7],
    [0.2, 0.3],
    [-1, 0.3],
    [-1, -0.3],
  ]),
];

export const STAR: Outline = [star()];

export const LINKED_RINGS: Outline = [circle(24, 0.55, -0.4, 0), circle(24, 0.55, 0.4, 0)];

export const KEY: Outline = [
  circle(16, 0.35, -0.55, 0),
  pts([
    [-0.2, 0],
    [0.9, 0],
  ]),
  pts([
    [0.55, 0],
    [0.55, -0.25],
  ]),
  pts([
    [0.8, 0],
    [0.8, -0.25],
  ]),
];

/** R, O, T, O: each 0.4 wide x 0.7 tall with 0.1 gaps, centred. */
export const ROTO: Outline = [
  pts([
    [-0.95, -0.35],
    [-0.95, 0.35],
    [-0.65, 0.35],
    [-0.55, 0.25],
    [-0.55, 0.1],
    [-0.65, 0],
    [-0.95, 0],
  ]),
  pts([
    [-0.8, 0],
    [-0.55, -0.35],
  ]),
  letterO(-0.45),
  pts([
    [0.05, 0.35],
    [0.45, 0.35],
  ]),
  pts([
    [0.25, 0.35],
    [0.25, -0.35],
  ]),
  letterO(0.55),
];
