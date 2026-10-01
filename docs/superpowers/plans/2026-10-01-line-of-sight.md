# Line of Sight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 7-level head-tracked alignment puzzle ("Line of Sight") as a third scene in RotoText.

**Architecture:** Pure modules in `src/game/` turn a 2D outline into 3D pieces lifted along rays from a solution eye, measure on-screen misalignment from the rendered eye, and run a small session state machine. A thin SVG renderer (`#game`, layered over the dimmed box grid in `#scene`) and a HUD draw it; `main.ts` runs a dedicated `requestAnimationFrame` loop while the game scene is active.

**Tech Stack:** Vite 8, TypeScript 7 (strict), Vitest 5 (node environment), plain SVG/DOM.

**Spec:** `docs/superpowers/specs/2026-10-01-line-of-sight-design.md`

## Global Constraints

- Screen space: mm, origin at screen centre, +x right, +y up, +z toward the viewer, glass at z = 0.
- `SOLUTION_DISTANCE_MM = 500`; `SHAPE_HALF_SIZE = 0.3 · min(rectWidth, rectHeight)`; `SEGMENT_MM = 25`; `BOX_MARGIN_MM = 5`.
- Depth separation: `min(60, 0.5 · (depthMax − depthMin))`, up to 20 redraws; PRNG mulberry32 seeded per level.
- `SOLVE_PX = 8`, `RESET_PX = 12`, `HOLD_MS = 800`, `FLY_MS = 600`, `PAUSE_MS = 1200`, tick `dt` clamped to ≤ 100 ms.
- Warmth: `#5b6b8c` at ≥ 120 px → `#ffb547` at ≤ 8 px, linear RGB. Ghost: `#f4f1ea`, opacity 0.15, dash `6 6`. Solve flash `#f4f1ea` for the first 200 ms of the flight.
- Piece stroke width `3 + 2 · progress` px while playing; 5 px while solving/done.
- End copy, exactly: `You found every line of sight`; button `Play again`; HUD label format `3 / 7 · Star`.
- DOM text via `textContent` only — never `innerHTML`.
- No new dependencies. Use `python3`, never `python`. Never `--no-verify`. No Co-Authored-By / AI attribution in commits.
- Gates after every task: `npm test`, `npm run typecheck`, `npm run build` (if npm hits EPERM in `~/.npm`, prefix `npm_config_cache="$TMPDIR/npm-cache"`).

## Review Focus

1. **Mouse mode with a still pointer** — the hold must still complete; nothing may depend on input events arriving. Pinned by Task 3 "solves with constant input across many ticks" and the independent game loop in Task 5.
2. **Window resized or moved mid-level** — the level rebuilds for the new rect, stays solvable, and only a *playing* hold resets (a solve in flight continues). Pinned by Task 3 `resetHold` tests and Task 2 small-window tests.
3. **Small / split-screen windows** — pieces must stay inside the box and every level stay solvable. Pinned by Task 2 "900 × 560 window" tests.
4. **Long frame gaps** (hidden tab, debugger, clock regress) — no instant solve, no NaN. Pinned by Task 3 `dt` clamp and negative-`dt` tests.
5. **Leaving and re-entering the game scene mid-level** — returns to the same level, not level 1, and the loop doesn't run twice. Pinned structurally in Task 5 (`gameLoopId` staleness check, session kept across switches); reviewer checks.

---

### Task 1: Shapes and level table

**Files:**
- Create: `src/game/shapes.ts`
- Create: `src/game/levels.ts`
- Test: `tests/game/shapes.test.ts`

**Interfaces:**
- Consumes: `Point2` from `src/geometry/screenSpace.ts`.
- Produces:
  - `type Outline = Point2[][]`; `circle(n: number, r: number, cx?: number, cy?: number): Point2[]`
  - `RING, TRIANGLE, ARROW, STAR, LINKED_RINGS, KEY, ROTO: Outline`
  - `interface LevelSpec { name: string; outline: Outline; offset: Point2; depthMin: number; depthMax: number; seed: number }`
  - `LEVELS: readonly LevelSpec[]` (7 entries, spec §4)

- [ ] **Step 1: Write the failing test** — `tests/game/shapes.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/game/levels';
import { ARROW, circle, KEY, LINKED_RINGS, RING, ROTO, STAR, TRIANGLE } from '../../src/game/shapes';

const ALL = { RING, TRIANGLE, ARROW, STAR, LINKED_RINGS, KEY, ROTO };

describe('shapes', () => {
  it.each(Object.entries(ALL))('%s stays within the unit square and has drawable polylines', (_, outline) => {
    expect(outline.length).toBeGreaterThan(0);
    for (const line of outline) {
      expect(line.length).toBeGreaterThanOrEqual(2);
      for (const p of line) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('circle is closed with n + 1 points at radius r', () => {
    const c = circle(8, 0.5, 0.2, -0.1);
    expect(c).toHaveLength(9);
    expect(c[8]!.x).toBeCloseTo(c[0]!.x, 12);
    expect(c[8]!.y).toBeCloseTo(c[0]!.y, 12);
    for (const p of c) expect(Math.hypot(p.x - 0.2, p.y + 0.1)).toBeCloseTo(0.5, 12);
  });

  it('ROTO is four letters wide: spans x from -0.95 to 0.95', () => {
    const xs = ROTO.flat().map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(-0.95, 12);
    expect(Math.max(...xs)).toBeCloseTo(0.95, 12);
  });
});

describe('LEVELS', () => {
  it('matches the spec table', () => {
    expect(
      LEVELS.map((l) => [l.name, l.offset.x, l.offset.y, l.depthMin, l.depthMax, l.seed]),
    ).toEqual([
      ['Ring', 100, 0, 20, 100, 1],
      ['Triangle', -120, 40, 20, 140, 2],
      ['Arrow', 0, 80, 30, 160, 3],
      ['Star', -150, -60, 30, 200, 4],
      ['Linked rings', 120, 80, 30, 220, 5],
      ['Key', 180, 0, 30, 240, 6],
      ['ROTO', -150, 100, 30, 240, 7],
    ]);
    expect(LEVELS.map((l) => l.outline)).toEqual([RING, TRIANGLE, ARROW, STAR, LINKED_RINGS, KEY, ROTO]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/game/shapes.test.ts`
Expected: FAIL — cannot resolve `../../src/game/levels`.

- [ ] **Step 3: Implement** — `src/game/shapes.ts`

```ts
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
```

`src/game/levels.ts`

```ts
import type { Point2 } from '../geometry/screenSpace';
import { ARROW, KEY, LINKED_RINGS, RING, ROTO, STAR, TRIANGLE, type Outline } from './shapes';

export interface LevelSpec {
  name: string;
  outline: Outline;
  /** Solution eye offset from the viewport centre, mm. */
  offset: Point2;
  /** Piece depths behind the glass, mm (positive). */
  depthMin: number;
  depthMax: number;
  seed: number;
}

/** Easy to hard: depth spread is the difficulty knob. */
export const LEVELS: readonly LevelSpec[] = [
  { name: 'Ring', outline: RING, offset: { x: 100, y: 0 }, depthMin: 20, depthMax: 100, seed: 1 },
  { name: 'Triangle', outline: TRIANGLE, offset: { x: -120, y: 40 }, depthMin: 20, depthMax: 140, seed: 2 },
  { name: 'Arrow', outline: ARROW, offset: { x: 0, y: 80 }, depthMin: 30, depthMax: 160, seed: 3 },
  { name: 'Star', outline: STAR, offset: { x: -150, y: -60 }, depthMin: 30, depthMax: 200, seed: 4 },
  { name: 'Linked rings', outline: LINKED_RINGS, offset: { x: 120, y: 80 }, depthMin: 30, depthMax: 220, seed: 5 },
  { name: 'Key', outline: KEY, offset: { x: 180, y: 0 }, depthMin: 30, depthMax: 240, seed: 6 },
  { name: 'ROTO', outline: ROTO, offset: { x: -150, y: 100 }, depthMin: 30, depthMax: 240, seed: 7 },
];
```

- [ ] **Step 4: Run the tests** — `npx vitest run tests/game/shapes.test.ts` → PASS; then `npm test`, `npm run typecheck`, `npm run build` all clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/shapes.ts src/game/levels.ts tests/game/shapes.test.ts
git commit -m "feat: add Line of Sight shapes and level table"
```

---

### Task 2: Level builder and alignment

**Files:**
- Create: `src/game/pieces.ts`
- Create: `src/game/alignment.ts`
- Test: `tests/game/pieces.test.ts`

**Interfaces:**
- Consumes: `LevelSpec`, `LEVELS` (Task 1); `rectCenter`, `viewportRectMm`, `ViewportRectMm` from `src/scene/targets.ts`; `projectPoint` from `src/geometry/perspective.ts`; `screenMmToViewport`, `ScreenFrame` from `src/geometry/screenSpace.ts`; `vec3`, `lerp`, `Vec3` from `src/geometry/vec3.ts`.
- Produces (`pieces.ts`):
  - constants `SOLUTION_DISTANCE_MM = 500`, `SHAPE_HALF_FRACTION = 0.3`, `SEGMENT_MM = 25`, `BOX_MARGIN_MM = 5`
  - `interface Piece { glass: [Vec3, Vec3]; lifted: [Vec3, Vec3] }`
  - `interface BuiltLevel { solutionEye: Vec3; pieces: Piece[] }`
  - `mulberry32(seed: number): () => number`
  - `splitEdge(a: Vec3, b: Vec3, maxLen: number): [Vec3, Vec3][]`
  - `liftPoint(p: Vec3, eye: Vec3, depth: number): Vec3`
  - `buildLevel(level: LevelSpec, rect: ViewportRectMm): BuiltLevel`
  - `pieceAt(piece: Piece, t: number): [Vec3, Vec3]`
- Produces (`alignment.ts`):
  - constants `SOLVE_PX = 8`, `RESET_PX = 12`, `COOL_AT_PX = 120`, `COOL_COLOR = '#5b6b8c'`, `WARM_COLOR = '#ffb547'`
  - `misalignmentPx(eye: Vec3, pieces: readonly Piece[], frame: ScreenFrame): number`
  - `warmthColor(px: number): string`

- [ ] **Step 1: Write the failing test** — `tests/game/pieces.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { COOL_COLOR, misalignmentPx, SOLVE_PX, warmthColor, WARM_COLOR } from '../../src/game/alignment';
import { LEVELS } from '../../src/game/levels';
import {
  BOX_MARGIN_MM,
  buildLevel,
  liftPoint,
  mulberry32,
  pieceAt,
  SEGMENT_MM,
  SOLUTION_DISTANCE_MM,
  splitEdge,
  type Piece,
} from '../../src/game/pieces';
import { projectPoint } from '../../src/geometry/perspective';
import { screenMmToViewport, type ScreenFrame } from '../../src/geometry/screenSpace';
import { vec3, type Vec3 } from '../../src/geometry/vec3';
import { rectCenter, viewportRectMm } from '../../src/scene/targets';

interface TestFrame {
  name: string;
  frame: ScreenFrame;
  w: number;
  h: number;
}

const MBA13 = { mmPerPx: 290.3 / 1470, screenWidthPx: 1470, screenHeightPx: 956 };
const FRAMES: TestFrame[] = [
  {
    name: '16" MacBook Pro, full width',
    frame: { mmPerPx: 345.6 / 1728, screenWidthPx: 1728, screenHeightPx: 1117, viewportOriginPx: { x: 0, y: 117 } },
    w: 1728,
    h: 1000,
  },
  { name: '13" MacBook Air, windowed', frame: { ...MBA13, viewportOriginPx: { x: 15, y: 100 } }, w: 1440, h: 800 },
];
const SMALL: TestFrame = { name: '900 x 560 split screen', frame: { ...MBA13, viewportOriginPx: { x: 285, y: 200 } }, w: 900, h: 560 };

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const moved = (e: Vec3, dx: number, dy: number) => vec3(e.x + dx, e.y + dy, e.z);

/** Mean misplacement after removing the average shift: how scrambled, not just how offset. */
function scatterPx(eye: Vec3, pieces: readonly Piece[], frame: ScreenFrame): number {
  const d: { x: number; y: number }[] = [];
  for (const p of pieces) {
    for (const k of [0, 1] as const) {
      const a = projectPoint(eye, p.lifted[k], frame)!;
      const g = screenMmToViewport(p.glass[k], frame);
      d.push({ x: a.x - g.x, y: a.y - g.y });
    }
  }
  const mx = d.reduce((s, v) => s + v.x, 0) / d.length;
  const my = d.reduce((s, v) => s + v.y, 0) / d.length;
  return d.reduce((s, v) => s + Math.hypot(v.x - mx, v.y - my), 0) / d.length;
}

function expectInsideBox(pieces: readonly Piece[], tf: TestFrame, depthMin: number, depthMax: number): void {
  const r = viewportRectMm(tf.frame, tf.w, tf.h);
  for (const p of pieces) {
    for (const q of p.lifted) {
      expect(q.x).toBeGreaterThanOrEqual(r.left + BOX_MARGIN_MM - 1e-9);
      expect(q.x).toBeLessThanOrEqual(r.right - BOX_MARGIN_MM + 1e-9);
      expect(q.y).toBeGreaterThanOrEqual(r.bottom + BOX_MARGIN_MM - 1e-9);
      expect(q.y).toBeLessThanOrEqual(r.top - BOX_MARGIN_MM + 1e-9);
      expect(-q.z).toBeGreaterThanOrEqual(depthMin - 1e-9);
      expect(-q.z).toBeLessThanOrEqual(depthMax + 1e-9);
    }
  }
}

describe('mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('splitEdge', () => {
  it('splits evenly into the fewest pieces no longer than maxLen, end to end', () => {
    const parts = splitEdge(vec3(0, 0, 0), vec3(60, 0, 0), 25);
    expect(parts).toHaveLength(3);
    for (const [a, b] of parts) expect(dist(a, b)).toBeCloseTo(20, 9);
    expect(parts[0]![0]).toEqual(vec3(0, 0, 0));
    expect(parts[2]![1]).toEqual(vec3(60, 0, 0));
    expect(parts[1]![0]).toEqual(parts[0]![1]);
  });

  it('keeps an edge of exactly maxLen whole, and a zero-length edge as one piece', () => {
    expect(splitEdge(vec3(0, 0, 0), vec3(25, 0, 0), 25)).toHaveLength(1);
    expect(splitEdge(vec3(1, 1, 0), vec3(1, 1, 0), 25)).toHaveLength(1);
  });
});

describe('liftPoint', () => {
  it('moves a glass point along the ray from the eye to the given depth', () => {
    const frame = FRAMES[0]!.frame;
    const eye = vec3(-80, 40, 500);
    const p = vec3(30, -20, 0);
    const q = liftPoint(p, eye, 150);
    expect(q.z).toBe(-150);
    const seen = projectPoint(eye, q, frame)!;
    const want = screenMmToViewport(p, frame);
    expect(dist(seen, want)).toBeLessThan(1e-9);
  });
});

for (const tf of FRAMES) {
  describe(`buildLevel on ${tf.name}`, () => {
    const rect = viewportRectMm(tf.frame, tf.w, tf.h);
    const centre = rectCenter(rect);
    const resting = vec3(centre.x, centre.y, SOLUTION_DISTANCE_MM);

    it.each(LEVELS.map((l) => [l.name, l] as const))('%s is solvable from its solution eye', (_, level) => {
      const built = buildLevel(level, rect);
      for (const p of built.pieces) {
        for (const k of [0, 1] as const) {
          const seen = projectPoint(built.solutionEye, p.lifted[k], tf.frame)!;
          expect(dist(seen, screenMmToViewport(p.glass[k], tf.frame))).toBeLessThan(1e-6);
        }
      }
      expect(misalignmentPx(built.solutionEye, built.pieces, tf.frame)).toBeLessThan(1e-6);
    });

    it.each(LEVELS.map((l) => [l.name, l] as const))('%s looks scrambled from a frontal seat', (_, level) => {
      const built = buildLevel(level, rect);
      expect(misalignmentPx(resting, built.pieces, tf.frame)).toBeGreaterThan(40);
      expect(scatterPx(resting, built.pieces, tf.frame)).toBeGreaterThan(15);
    });

    it.each(LEVELS.map((l) => [l.name, l] as const))('%s breaks when the eye moves 30 mm off the solution', (_, level) => {
      const built = buildLevel(level, rect);
      for (const [dx, dy] of [
        [30, 0],
        [-30, 0],
        [0, 30],
        [0, -30],
      ] as const) {
        expect(misalignmentPx(moved(built.solutionEye, dx, dy), built.pieces, tf.frame)).toBeGreaterThan(12);
      }
    });

    it.each(LEVELS.map((l) => [l.name, l] as const))('%s keeps every piece inside the box', (_, level) => {
      expectInsideBox(buildLevel(level, rect).pieces, tf, level.depthMin, level.depthMax);
    });

    it.each(LEVELS.map((l) => [l.name, l] as const))('%s is deterministic with short segments', (_, level) => {
      const built = buildLevel(level, rect);
      expect(buildLevel(level, rect)).toEqual(built);
      for (const p of built.pieces) expect(dist(p.glass[0], p.glass[1])).toBeLessThanOrEqual(SEGMENT_MM + 1e-9);
    });
  });
}

describe(`buildLevel on a ${SMALL.name}`, () => {
  const rect = viewportRectMm(SMALL.frame, SMALL.w, SMALL.h);
  it.each(LEVELS.map((l) => [l.name, l] as const))('%s stays solvable and inside the box', (_, level) => {
    const built = buildLevel(level, rect);
    expect(misalignmentPx(built.solutionEye, built.pieces, SMALL.frame)).toBeLessThan(1e-6);
    expectInsideBox(built.pieces, SMALL, level.depthMin, level.depthMax);
  });
});

describe('level solution eyes', () => {
  it('stay within the tracker field of view (30 degrees)', () => {
    for (const l of LEVELS) {
      expect(Math.hypot(l.offset.x, l.offset.y) / SOLUTION_DISTANCE_MM).toBeLessThanOrEqual(Math.tan(Math.PI / 6));
    }
  });
});

describe('pieceAt', () => {
  const tf = FRAMES[0]!;
  const built = buildLevel(LEVELS[3]!, viewportRectMm(tf.frame, tf.w, tf.h));
  const piece = built.pieces[5]!;

  it('runs from the lifted piece (t = 0) to the glass (t = 1)', () => {
    expect(pieceAt(piece, 0)).toEqual(piece.lifted);
    const [a, b] = pieceAt(piece, 1);
    expect(dist(a, piece.glass[0])).toBeLessThan(1e-9);
    expect(dist(b, piece.glass[1])).toBeLessThan(1e-9);
    expect(Math.abs(a.z)).toBeLessThan(1e-9);
  });

  it('stays aligned from the solution eye for the whole flight', () => {
    const want = screenMmToViewport(piece.glass[0], tf.frame);
    for (const t of [0, 0.25, 0.5, 1]) {
      const seen = projectPoint(built.solutionEye, pieceAt(piece, t)[0], tf.frame)!;
      expect(dist(seen, want)).toBeLessThan(1e-6);
    }
  });
});

describe('misalignmentPx', () => {
  const frame = FRAMES[0]!.frame;
  it('is Infinity when a piece cannot be projected, or there are no pieces', () => {
    const tooClose: Piece = { glass: [vec3(0, 0, 0), vec3(1, 0, 0)], lifted: [vec3(0, 0, 90), vec3(1, 0, 90)] };
    expect(misalignmentPx(vec3(0, 0, 100), [tooClose], frame)).toBe(Infinity);
    expect(misalignmentPx(vec3(0, 0, 500), [], frame)).toBe(Infinity);
  });
});

describe('warmthColor', () => {
  it('is cool far away, warm at the solve threshold, and a hex colour between', () => {
    for (const px of [120, 500, Infinity, NaN]) expect(warmthColor(px)).toBe(COOL_COLOR);
    for (const px of [SOLVE_PX, 0]) expect(warmthColor(px)).toBe(WARM_COLOR);
    const mid = warmthColor(64);
    expect(mid).toMatch(/^#[0-9a-f]{6}$/);
    expect(mid).not.toBe(COOL_COLOR);
    expect(mid).not.toBe(WARM_COLOR);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/game/pieces.test.ts`
Expected: FAIL — cannot resolve `../../src/game/alignment`.

- [ ] **Step 3: Implement** — `src/game/pieces.ts`

```ts
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
```

`src/game/alignment.ts`

```ts
import { projectPoint } from '../geometry/perspective';
import { screenMmToViewport, type ScreenFrame } from '../geometry/screenSpace';
import type { Vec3 } from '../geometry/vec3';
import type { Piece } from './pieces';

/** Below this mean misalignment (viewport px) a hold starts. */
export const SOLVE_PX = 8;
/** A hold under way survives up to this; above it the hold resets. */
export const RESET_PX = 12;
export const COOL_AT_PX = 120;
export const COOL_COLOR = '#5b6b8c';
export const WARM_COLOR = '#ffb547';

/**
 * Mean on-screen distance (viewport px) between where each piece end is drawn from `eye`
 * and where it belongs on the outline. It depends only on the rendered eye, so tracking
 * calibration error moves the sweet spot but never makes a level unsolvable.
 */
export function misalignmentPx(eye: Vec3, pieces: readonly Piece[], frame: ScreenFrame): number {
  if (pieces.length === 0) return Infinity;
  let sum = 0;
  for (const p of pieces) {
    for (const k of [0, 1] as const) {
      const seen = projectPoint(eye, p.lifted[k], frame);
      if (!seen) return Infinity;
      const want = screenMmToViewport(p.glass[k], frame);
      sum += Math.hypot(seen.x - want.x, seen.y - want.y);
    }
  }
  return sum / (2 * pieces.length);
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Piece colour: cool slate when far off, amber at the solve threshold. */
export function warmthColor(px: number): string {
  const k = Number.isNaN(px) ? 1 : Math.min(1, Math.max(0, (px - SOLVE_PX) / (COOL_AT_PX - SOLVE_PX)));
  const warm = channels(WARM_COLOR);
  const cool = channels(COOL_COLOR);
  return `#${warm.map((w, i) => Math.round(w + (cool[i]! - w) * k).toString(16).padStart(2, '0')).join('')}`;
}
```

- [ ] **Step 4: Run the tests** — `npx vitest run tests/game/pieces.test.ts` → PASS; then `npm test`, `npm run typecheck`, `npm run build` all clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/pieces.ts src/game/alignment.ts tests/game/pieces.test.ts
git commit -m "feat: build Line of Sight levels along rays from the solution eye"
```

---

### Task 3: Session state machine and view

**Files:**
- Create: `src/game/session.ts`
- Test: `tests/game/session.test.ts`

**Interfaces:**
- Consumes: `SOLVE_PX`, `RESET_PX`, `warmthColor`, `WARM_COLOR` from `src/game/alignment.ts` (Task 2).
- Produces:
  - constants `HOLD_MS = 800`, `FLY_MS = 600`, `PAUSE_MS = 1200`, `MAX_TICK_MS = 100`, `FLASH_MS = 200`, `FLASH_COLOR = '#f4f1ea'`
  - `type Phase = 'playing' | 'solving' | 'done'`
  - `interface Session { levelIndex: number; phase: Phase; holdMs: number; phaseMs: number }`
  - `initialSession(): Session`
  - `stepSession(s: Session, misalignmentPx: number, dtMs: number, levelCount: number): Session`
  - `skipLevel(s: Session, levelCount: number): Session`
  - `resetHold(s: Session): Session`
  - `interface GameView { flyT: number; color: string; widthPx: number; progress: number }`
  - `gameView(s: Session, misalignmentPx: number): GameView`

- [ ] **Step 1: Write the failing test** — `tests/game/session.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { COOL_COLOR, WARM_COLOR } from '../../src/game/alignment';
import {
  FLASH_COLOR,
  FLY_MS,
  gameView,
  HOLD_MS,
  initialSession,
  PAUSE_MS,
  resetHold,
  skipLevel,
  stepSession,
  type Session,
} from '../../src/game/session';

const N = 7;
const run = (s: Session, px: number, ticks: number, dt = 40) => {
  for (let i = 0; i < ticks; i++) s = stepSession(s, px, dt, N);
  return s;
};

describe('stepSession', () => {
  it('starts playing level 0 with no hold', () => {
    expect(initialSession()).toEqual({ levelIndex: 0, phase: 'playing', holdMs: 0, phaseMs: 0 });
  });

  it('builds a hold below 8 px and solves at 800 ms of constant input (a still mouse)', () => {
    const s = run(initialSession(), 5, 19);
    expect(s.phase).toBe('playing');
    expect(s.holdMs).toBe(760);
    const solved = stepSession(s, 5, 40, N);
    expect(solved.phase).toBe('solving');
    expect(solved.phaseMs).toBe(0);
  });

  it('keeps a hold through a 10 px blip but resets above 12 px', () => {
    const holding = run(initialSession(), 5, 5);
    const blip = stepSession(holding, 10, 40, N);
    expect(blip.holdMs).toBe(240);
    expect(stepSession(blip, 13, 40, N).holdMs).toBe(0);
  });

  it('does not start a hold between 8 and 12 px', () => {
    expect(run(initialSession(), 10, 10).holdMs).toBe(0);
  });

  it('clamps a long frame gap to 100 ms and treats a negative gap as zero', () => {
    const s = stepSession(initialSession(), 5, 5000, N);
    expect(s.holdMs).toBe(100);
    expect(s.phase).toBe('playing');
    expect(stepSession(s, 5, -50, N).holdMs).toBe(100);
  });

  it('moves to the next level after the flight and pause', () => {
    const solving: Session = { levelIndex: 2, phase: 'solving', holdMs: HOLD_MS, phaseMs: 0 };
    const almost = run(solving, Infinity, (FLY_MS + PAUSE_MS) / 100 - 1, 100);
    expect(almost.phase).toBe('solving');
    expect(almost.levelIndex).toBe(2);
    expect(stepSession(almost, Infinity, 100, N)).toEqual({ levelIndex: 3, phase: 'playing', holdMs: 0, phaseMs: 0 });
  });

  it('ends after the last level and then stays done', () => {
    const last: Session = { levelIndex: N - 1, phase: 'solving', holdMs: HOLD_MS, phaseMs: FLY_MS + PAUSE_MS - 1 };
    const done = stepSession(last, 0, 40, N);
    expect(done.phase).toBe('done');
    expect(done.levelIndex).toBe(N - 1);
    expect(stepSession(done, 0, 40, N)).toEqual(done);
  });
});

describe('skipLevel', () => {
  it('jumps to the next level, ends from the last, and does nothing when done', () => {
    expect(skipLevel({ levelIndex: 1, phase: 'solving', holdMs: HOLD_MS, phaseMs: 300 }, N)).toEqual({
      levelIndex: 2,
      phase: 'playing',
      holdMs: 0,
      phaseMs: 0,
    });
    const done = skipLevel({ levelIndex: N - 1, phase: 'playing', holdMs: 0, phaseMs: 0 }, N);
    expect(done.phase).toBe('done');
    expect(skipLevel(done, N)).toEqual(done);
  });
});

describe('resetHold', () => {
  it('clears a playing hold but leaves a solve in flight alone', () => {
    expect(resetHold({ levelIndex: 0, phase: 'playing', holdMs: 500, phaseMs: 900 }).holdMs).toBe(0);
    const solving: Session = { levelIndex: 0, phase: 'solving', holdMs: HOLD_MS, phaseMs: 300 };
    expect(resetHold(solving)).toEqual(solving);
  });
});

describe('gameView', () => {
  it('playing: pieces float, colour follows warmth, width grows with the hold', () => {
    expect(gameView({ levelIndex: 0, phase: 'playing', holdMs: 0, phaseMs: 0 }, 500)).toEqual({
      flyT: 0,
      color: COOL_COLOR,
      widthPx: 3,
      progress: 0,
    });
    const v = gameView({ levelIndex: 0, phase: 'playing', holdMs: HOLD_MS / 2, phaseMs: 0 }, 4);
    expect(v.color).toBe(WARM_COLOR);
    expect(v.widthPx).toBe(4);
    expect(v.progress).toBe(0.5);
  });

  it('solving: flashes, then eases the pieces onto the glass', () => {
    const at = (phaseMs: number) => gameView({ levelIndex: 0, phase: 'solving', holdMs: HOLD_MS, phaseMs }, 0);
    expect(at(0).color).toBe(FLASH_COLOR);
    expect(at(0).flyT).toBe(0);
    expect(at(250).color).toBe(WARM_COLOR);
    expect(at(FLY_MS / 2).flyT).toBeCloseTo(1 - 0.5 ** 3, 12);
    expect(at(FLY_MS).flyT).toBe(1);
    expect(at(FLY_MS + 500).flyT).toBe(1);
    expect(at(FLY_MS).widthPx).toBe(5);
    expect(at(FLY_MS).progress).toBe(1);
  });

  it('done: the shape rests on the glass in amber', () => {
    expect(gameView({ levelIndex: N - 1, phase: 'done', holdMs: 0, phaseMs: 0 }, 300)).toEqual({
      flyT: 1,
      color: WARM_COLOR,
      widthPx: 5,
      progress: 1,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/game/session.test.ts`
Expected: FAIL — cannot resolve `../../src/game/session`.

- [ ] **Step 3: Implement** — `src/game/session.ts`

```ts
import { RESET_PX, SOLVE_PX, warmthColor, WARM_COLOR } from './alignment';

export const HOLD_MS = 800;
export const FLY_MS = 600;
export const PAUSE_MS = 1200;
/** A hidden tab or a debugger pause must not count as holding still. */
export const MAX_TICK_MS = 100;
export const FLASH_MS = 200;
export const FLASH_COLOR = '#f4f1ea';
const BASE_WIDTH_PX = 3;
const HOLD_WIDTH_PX = 2;

export type Phase = 'playing' | 'solving' | 'done';

export interface Session {
  levelIndex: number;
  phase: Phase;
  holdMs: number;
  /** Time spent in the current phase. */
  phaseMs: number;
}

export const initialSession = (): Session => ({ levelIndex: 0, phase: 'playing', holdMs: 0, phaseMs: 0 });

const nextLevel = (s: Session, levelCount: number): Session =>
  s.levelIndex + 1 >= levelCount
    ? { levelIndex: s.levelIndex, phase: 'done', holdMs: 0, phaseMs: 0 }
    : { levelIndex: s.levelIndex + 1, phase: 'playing', holdMs: 0, phaseMs: 0 };

export function stepSession(s: Session, misalignmentPx: number, dtMs: number, levelCount: number): Session {
  const dt = Math.min(Math.max(dtMs, 0), MAX_TICK_MS);
  if (s.phase === 'done') return s;
  if (s.phase === 'solving') {
    const phaseMs = s.phaseMs + dt;
    return phaseMs >= FLY_MS + PAUSE_MS ? nextLevel(s, levelCount) : { ...s, phaseMs };
  }
  // A hold starts below SOLVE_PX and survives small wobbles up to RESET_PX.
  const holding = misalignmentPx < SOLVE_PX || (s.holdMs > 0 && misalignmentPx <= RESET_PX);
  const holdMs = holding ? s.holdMs + dt : 0;
  if (holdMs >= HOLD_MS) return { ...s, phase: 'solving', holdMs: HOLD_MS, phaseMs: 0 };
  return { ...s, holdMs, phaseMs: s.phaseMs + dt };
}

export function skipLevel(s: Session, levelCount: number): Session {
  return s.phase === 'done' ? s : nextLevel(s, levelCount);
}

/** After a resize the pieces move, so a hold in progress no longer means anything. */
export const resetHold = (s: Session): Session => (s.phase === 'playing' ? { ...s, holdMs: 0 } : s);

export interface GameView {
  /** 0 = pieces floating, 1 = flat on the glass. */
  flyT: number;
  color: string;
  widthPx: number;
  /** Hold progress for the HUD bar, 0..1. */
  progress: number;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function gameView(s: Session, misalignmentPx: number): GameView {
  const solvedWidth = BASE_WIDTH_PX + HOLD_WIDTH_PX;
  if (s.phase === 'done') return { flyT: 1, color: WARM_COLOR, widthPx: solvedWidth, progress: 1 };
  if (s.phase === 'solving') {
    return {
      flyT: easeOutCubic(Math.min(1, s.phaseMs / FLY_MS)),
      color: s.phaseMs < FLASH_MS ? FLASH_COLOR : WARM_COLOR,
      widthPx: solvedWidth,
      progress: 1,
    };
  }
  const progress = s.holdMs / HOLD_MS;
  return { flyT: 0, color: warmthColor(misalignmentPx), widthPx: BASE_WIDTH_PX + HOLD_WIDTH_PX * progress, progress };
}
```

- [ ] **Step 4: Run the tests** — `npx vitest run tests/game/session.test.ts` → PASS; then `npm test`, `npm run typecheck`, `npm run build` all clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/session.ts tests/game/session.test.ts
git commit -m "feat: add the Line of Sight session state machine"
```

---

### Task 4: Grid-only scene, game renderer and HUD

**Files:**
- Modify: `src/scene/targets.ts` (export `buildBoxGrid`)
- Create: `src/scene/gameRenderer.ts`
- Create: `src/ui/gameHud.ts`
- Test: `tests/scene/targets.test.ts` (add a block), `tests/game/hud.test.ts`

**Interfaces:**
- Consumes: `BuiltLevel`, `pieceAt` (Task 2); `GameView` (Task 3); `projectPoint`; `screenMmToViewport`, `ScreenFrame`.
- Produces:
  - `buildBoxGrid(rect: ViewportRectMm): Primitive[]` (grid lines only, sorted far → near)
  - `createGameRenderer(svg: SVGSVGElement): GameRenderer` with `setLevel(level: BuiltLevel): void` and `render(eye: Vec3, frame: ScreenFrame, view: GameView): void`
  - `hudLabel(levelIndex: number, levelCount: number, name: string): string`; `END_MESSAGE = 'You found every line of sight'`
  - `interface GameHudState { levelIndex: number; levelCount: number; levelName: string; progress: number; done: boolean }`
  - `createGameHud(root: HTMLElement): GameHud` with `show(visible: boolean)`, `update(state: GameHudState)`, `onSkip(handler: () => void)`, `onRestart(handler: () => void)`

- [ ] **Step 1: Write the failing tests**

Append to `tests/scene/targets.test.ts` (add `buildBoxGrid` to its existing import from `../../src/scene/targets`):

```ts
describe('buildBoxGrid', () => {
  it('is exactly the grid part of the targets scene, without targets or sticks', () => {
    const grid = buildBoxGrid(rect);
    expect(grid.length).toBeGreaterThan(0);
    expect(grid.every((p) => p.kind === 'line' && p.role === 'grid')).toBe(true);
    expect(buildTargetsScene(rect).slice(0, grid.length)).toEqual(grid);
  });
});
```

`tests/game/hud.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { END_MESSAGE, hudLabel } from '../../src/ui/gameHud';

describe('hudLabel', () => {
  it('shows a 1-based level number, the count and the name', () => {
    expect(hudLabel(2, 7, 'Star')).toBe('3 / 7 · Star');
  });

  it('has the agreed end copy', () => {
    expect(END_MESSAGE).toBe('You found every line of sight');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/scene/targets.test.ts tests/game/hud.test.ts`
Expected: FAIL — `buildBoxGrid` is not exported; cannot resolve `../../src/ui/gameHud`.

- [ ] **Step 3: Implement**

`src/scene/targets.ts` — add above `buildTargetsScene`, and use it there:

```ts
/** The box walls' grid alone, far → near: the backdrop for Line of Sight. */
export function buildBoxGrid(rect: ViewportRectMm): Primitive[] {
  return boxGrid(rect).sort(byDepth);
}
```

In `buildTargetsScene`, replace `boxGrid(rect).sort(byDepth)` in the returned array with `buildBoxGrid(rect)`.

`src/scene/gameRenderer.ts`:

```ts
import { pieceAt, type BuiltLevel } from '../game/pieces';
import type { GameView } from '../game/session';
import { projectPoint } from '../geometry/perspective';
import { screenMmToViewport, type Point2, type ScreenFrame } from '../geometry/screenSpace';
import type { Vec3 } from '../geometry/vec3';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GHOST_COLOR = '#f4f1ea';

export interface GameRenderer {
  /** Replace the drawn level; creates one ghost and one piece line per piece. */
  setLevel(level: BuiltLevel): void;
  /** Project every piece from `eye` and update the SVG in place. */
  render(eye: Vec3, frame: ScreenFrame, view: GameView): void;
}

const px = (v: number) => v.toFixed(2);

function setLine(el: SVGLineElement, a: Point2, b: Point2): void {
  el.setAttribute('x1', px(a.x));
  el.setAttribute('y1', px(a.y));
  el.setAttribute('x2', px(b.x));
  el.setAttribute('y2', px(b.y));
}

export function createGameRenderer(svg: SVGSVGElement): GameRenderer {
  const ghostGroup = document.createElementNS(SVG_NS, 'g');
  ghostGroup.setAttribute('stroke', GHOST_COLOR);
  ghostGroup.setAttribute('stroke-opacity', '0.15');
  ghostGroup.setAttribute('stroke-width', '1.5');
  ghostGroup.setAttribute('stroke-dasharray', '6 6');
  const pieceGroup = document.createElementNS(SVG_NS, 'g');
  pieceGroup.setAttribute('stroke-linecap', 'round');
  svg.replaceChildren(ghostGroup, pieceGroup);

  let level: BuiltLevel | null = null;
  let ghosts: SVGLineElement[] = [];
  let pieces: { el: SVGLineElement; visible: boolean | null }[] = [];
  let lastColor = '';
  let lastWidth = '';

  return {
    setLevel(next) {
      level = next;
      ghosts = next.pieces.map(() => document.createElementNS(SVG_NS, 'line'));
      pieces = next.pieces.map(() => ({ el: document.createElementNS(SVG_NS, 'line'), visible: null }));
      ghostGroup.replaceChildren(...ghosts);
      pieceGroup.replaceChildren(...pieces.map((p) => p.el));
    },

    render(eye, frame, view) {
      if (!level) return;
      // Colour and width are shared by every piece: set them once on the group.
      if (view.color !== lastColor) {
        pieceGroup.setAttribute('stroke', view.color);
        lastColor = view.color;
      }
      const width = view.widthPx.toFixed(2);
      if (width !== lastWidth) {
        pieceGroup.setAttribute('stroke-width', width);
        lastWidth = width;
      }
      level.pieces.forEach((piece, i) => {
        setLine(ghosts[i]!, screenMmToViewport(piece.glass[0], frame), screenMmToViewport(piece.glass[1], frame));
        const [qa, qb] = pieceAt(piece, view.flyT);
        const a = projectPoint(eye, qa, frame);
        const b = projectPoint(eye, qb, frame);
        const item = pieces[i]!;
        const visible = a !== null && b !== null;
        if (visible !== item.visible) {
          item.el.setAttribute('visibility', visible ? 'visible' : 'hidden');
          item.visible = visible;
        }
        if (a && b) setLine(item.el, a, b);
      });
    },
  };
}
```

`src/ui/gameHud.ts`:

```ts
export const END_MESSAGE = 'You found every line of sight';

export const hudLabel = (levelIndex: number, levelCount: number, name: string): string =>
  `${levelIndex + 1} / ${levelCount} · ${name}`;

export interface GameHudState {
  levelIndex: number;
  levelCount: number;
  levelName: string;
  progress: number;
  done: boolean;
}

export interface GameHud {
  show(visible: boolean): void;
  update(state: GameHudState): void;
  onSkip(handler: () => void): void;
  onRestart(handler: () => void): void;
}

function button(text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  // A mouse click must not leave focus here, or Space would re-click it.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  return b;
}

/** Level label, Skip and hold progress while playing; the end message and Play again after. */
export function createGameHud(root: HTMLElement): GameHud {
  const label = document.createElement('span');
  const track = document.createElement('div');
  track.className = 'track';
  const fill = document.createElement('div');
  fill.className = 'fill';
  track.append(fill);
  const skip = button('Skip');
  const end = document.createElement('span');
  end.textContent = END_MESSAGE;
  const restart = button('Play again');
  root.replaceChildren(label, track, skip, end, restart);

  let lastLabel = '';
  let lastFill = '';
  let lastDone: boolean | null = null;

  return {
    show(visible) {
      root.hidden = !visible;
    },
    update(state) {
      if (state.done !== lastDone) {
        for (const el of [label, track, skip]) el.hidden = state.done;
        for (const el of [end, restart]) el.hidden = !state.done;
        lastDone = state.done;
      }
      const text = hudLabel(state.levelIndex, state.levelCount, state.levelName);
      if (text !== lastLabel) {
        label.textContent = text;
        lastLabel = text;
      }
      const width = `${Math.round(Math.min(1, Math.max(0, state.progress)) * 100)}%`;
      if (width !== lastFill) {
        fill.style.width = width;
        lastFill = width;
      }
    },
    onSkip(handler) {
      skip.addEventListener('click', handler);
    },
    onRestart(handler) {
      restart.addEventListener('click', handler);
    },
  };
}
```

- [ ] **Step 4: Run the tests** — `npx vitest run tests/scene/targets.test.ts tests/game/hud.test.ts` → PASS; then `npm test`, `npm run typecheck`, `npm run build` all clean.

- [ ] **Step 5: Commit**

```bash
git add src/scene/targets.ts src/scene/gameRenderer.ts src/ui/gameHud.ts tests/scene/targets.test.ts tests/game/hud.test.ts
git commit -m "feat: add the Line of Sight renderer, HUD and grid-only backdrop"
```

---

### Task 5: Integration — third scene, game loop, styles

**Files:**
- Modify: `index.html`, `src/ui/demo.ts`, `src/ui/sceneSwitch.ts`, `src/styles.css`, `src/main.ts`

**Interfaces:**
- Consumes: everything above — `LEVELS`; `buildLevel`; `misalignmentPx`; `initialSession`, `stepSession`, `skipLevel`, `resetHold`, `gameView`, `Session`; `createGameRenderer`; `createGameHud`; `buildBoxGrid`.
- Produces: `SceneName = 'targets' | 'text' | 'game'`; `DemoElements.game: SVGSVGElement`, `DemoElements.gameHud: HTMLElement`.

- [ ] **Step 1: Markup** — in `index.html`, directly after `<svg id="scene" aria-hidden="true"></svg>`:

```html
    <svg id="game" aria-hidden="true"></svg>
    <div id="game-hud" hidden></div>
```

- [ ] **Step 2: Elements** — in `src/ui/demo.ts`, add `game: SVGSVGElement;` and `gameHud: HTMLElement;` to `DemoElements`, and in `getDemoElements()` mirror the existing `#scene` check:

```ts
  const game = document.getElementById('game');
  if (!(game instanceof SVGSVGElement)) throw new Error('Missing #game');
```

then add `game,` and `gameHud: byId('game-hud'),` to the returned object (use the file's existing `byId` helper exactly as the other HTML elements do).

- [ ] **Step 3: Scene switch** — in `src/ui/sceneSwitch.ts`:

```ts
export type SceneName = 'targets' | 'text' | 'game';
```

```ts
const LABELS: Record<SceneName, string> = { targets: 'Targets', text: 'Text', game: 'Line of Sight' };
```

and change the doc comment `/** A two-button segmented control, prepended to \`root\`. */` to `/** A segmented scene control, prepended to \`root\`. */`.

- [ ] **Step 4: Styles** — in `src/styles.css`, replace

```css
body:not([data-scene='targets']) #scene {
  display: none;
}
```

with

```css
body[data-scene='text'] #scene {
  display: none;
}

#game {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

body:not([data-scene='game']) #game {
  display: none;
}

body[data-scene='game'] #stage {
  display: none;
}

/* Line of Sight: the box grid stays as depth context, dimmed behind the pieces. */
body[data-scene='game'] #scene {
  opacity: 0.35;
}

/* Static would make every level unsolvable, so the toggle is hidden in the game. */
body[data-scene='game'] #follow-toggle {
  display: none;
}

#game-hud {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  z-index: 6;
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--rule);
  border-radius: 999px;
  background: var(--panel);
  color: var(--fg);
  font-size: 0.85rem;
}

#game-hud[hidden] {
  display: none;
}

#game-hud button {
  font: inherit;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--rule);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

#game-hud .track {
  width: 80px;
  height: 4px;
  border-radius: 2px;
  background: var(--rule);
  overflow: hidden;
}

#game-hud .fill {
  width: 0;
  height: 100%;
  background: var(--accent);
}
```

- [ ] **Step 5: main.ts imports** — add:

```ts
import { misalignmentPx } from './game/alignment';
import { LEVELS } from './game/levels';
import { buildLevel } from './game/pieces';
import { gameView, initialSession, resetHold, skipLevel, stepSession, type Session } from './game/session';
import { createGameRenderer } from './scene/gameRenderer';
import { createGameHud } from './ui/gameHud';
```

and change the targets import to `import { buildBoxGrid, buildTargetsScene, rectCenter, viewportRectMm } from './scene/targets';`.

- [ ] **Step 6: Scene content per scene** — replace

```ts
const renderer = createSvgRenderer(els.scene);
renderer.setScene(buildTargetsScene(sceneRect));
```

with

```ts
const renderer = createSvgRenderer(els.scene);
/** Targets shows the full scene; Line of Sight uses the box grid alone as a backdrop. */
const backdrop = () => (scene === 'game' ? buildBoxGrid(sceneRect) : buildTargetsScene(sceneRect));
renderer.setScene(backdrop());

let session: Session = initialSession();
let level = buildLevel(LEVELS[session.levelIndex]!, sceneRect);
const gameRenderer = createGameRenderer(els.game);
gameRenderer.setLevel(level);
const hud = createGameHud(els.gameHud);
/** Bumped on every entry to the game scene so a stale loop stops itself. */
let gameLoopId = 0;
let lastGameMs: number | null = null;
```

In `remeasure()`, replace `renderer.setScene(buildTargetsScene(sceneRect));` with:

```ts
  renderer.setScene(backdrop());
  // The pieces depend on the viewport rect: rebuild, and drop a hold that no longer applies.
  loadLevel();
  session = resetHold(session);
```

- [ ] **Step 7: render()** — replace

```ts
  if (scene === 'targets') {
    renderer.render(following ? eye : restingEye(), frame);
  } else if (following) {
```

with

```ts
  if (scene !== 'text') {
    // The game always follows: a static view could never be solved.
    renderer.render(scene === 'game' || following ? eye : restingEye(), frame);
  } else if (following) {
```

- [ ] **Step 8: Game loop** — add after `remeasure()`'s definition (function declarations are hoisted, so `remeasure` may call `loadLevel`):

```ts
function loadLevel(): void {
  level = buildLevel(LEVELS[session.levelIndex]!, sceneRect);
  gameRenderer.setLevel(level);
}

/**
 * Runs every display frame while Line of Sight is showing — independently of camera frames
 * and mouse events, so a hold completes even with a perfectly still pointer.
 */
function gameTick(nowMs: number, id: number): void {
  if (id !== gameLoopId || scene !== 'game') return;
  const dt = lastGameMs === null ? 0 : nowMs - lastGameMs;
  lastGameMs = nowMs;
  const eye = lastEye ?? restingEye();
  const misalignment = misalignmentPx(eye, level.pieces, frame);
  const before = session.levelIndex;
  session = stepSession(session, misalignment, dt, LEVELS.length);
  if (session.levelIndex !== before) loadLevel();
  const view = gameView(session, misalignment);
  gameRenderer.render(eye, frame, view);
  hud.update({
    levelIndex: session.levelIndex,
    levelCount: LEVELS.length,
    levelName: LEVELS[session.levelIndex]!.name,
    progress: view.progress,
    done: session.phase === 'done',
  });
  requestAnimationFrame((t) => gameTick(t, id));
}

function startGameLoop(): void {
  lastGameMs = null;
  const id = ++gameLoopId;
  requestAnimationFrame((t) => gameTick(t, id));
}

hud.onSkip(() => {
  const before = session.levelIndex;
  session = skipLevel(session, LEVELS.length);
  if (session.levelIndex !== before) loadLevel();
});
hud.onRestart(() => {
  session = initialSession();
  loadLevel();
});
```

- [ ] **Step 9: Space and the scene switch** — in the `keydown` handler, after `if (e.code !== 'Space' || e.repeat) return;` add:

```ts
  if (scene === 'game') return;
```

and replace the scene-switch handler body with:

```ts
createSceneSwitch(els.topbar, scene).onChange((next) => {
  scene = next;
  document.body.dataset.scene = next;
  // The text stage was display:none, so its layout must be measured now.
  remeasure();
  // The session survives switching away, so returning resumes the same level.
  hud.show(next === 'game');
  if (next === 'game') startGameLoop();
});
```

- [ ] **Step 10: Gates** — `npm test`, `npm run typecheck`, `npm run build` all clean. `git grep -n innerHTML src` prints nothing.

- [ ] **Step 11: Commit**

```bash
git add index.html src/ui/demo.ts src/ui/sceneSwitch.ts src/styles.css src/main.ts
git commit -m "feat: add Line of Sight as a third scene with its own game loop"
```

---

**After all tasks:** final whole-branch review, one fix wave if needed, then `git push origin main`.

**Manual (Sean, MacBook)** — spec §8: play all 7 levels in camera mode (note how tight 8 px feels); two levels in mouse mode including a still-pointer hold; ROTO readable and the flight aligned; resize mid-level; switch to Targets/Text and back (same level resumes).
