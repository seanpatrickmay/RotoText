# RotoText Targets Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a head-tracked "window into a box" scene with Johnny Lee–style ring targets (default scene), a Targets/Text switch, and one-click camera calibration, to the existing RotoText app.

**Architecture:** A pure `projectPoint` (eye → screen-plane ray intersection) projects a pure, data-only scene (box grid lines, target discs, sticks) built from the viewport rectangle in mm; a thin SVG renderer creates elements once and updates their coordinates each frame. Calibration is a pure median/field-of-view solve plus a storage wrapper; `main.ts` wires both into the existing tracking loop.

**Tech Stack:** Vite 8.3.1, TypeScript 7.0.2, Vitest 5.0.3, `@mediapipe/tasks-vision` 1.0.1. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-rototext-targets-design.md` (builds on `docs/superpowers/specs/2026-09-30-rototext-design.md`). Read both before starting.

## Global Constraints

- No new dependencies. Runtime dependency remains only `@mediapipe/tasks-vision@1.0.1`.
- Inside the Claude Code sandbox: prefix npm commands with `npm_config_cache="$TMPDIR/npm-cache"`; run `git add`/`git commit`/`git push` outside the sandbox (`.git` writes are denied in-sandbox).
- Commit once per task on `main` (Sean authorized). Never `--no-verify`. No `Co-Authored-By` or AI attribution. Push only at the end of the plan.
- No README or docs beyond the spec and this plan.
- World units: millimetres in screen space (origin screen centre, +x right, +y up, +z toward viewer, screen at z = 0); CSS px only in viewport space.
- Constants (verbatim from the spec): `BOX_DEPTH_MM = 250`; `GRID_MM = 25`; 8 targets per the spec §3 table; discs `r`, `0.66r`, `0.33r` filled `#e5484d`, `#f4f1ea`, `#e5484d`, as 48-gons; depth-cue opacity `1 − 0.5 · (−z / 250)` behind the screen, `1` in front; grid line width `1.5 − 0.75 · (−z / 250)` px; eye depth clamp `MIN_EYE_Z_MM = 100`; too-close guard `e.z − q.z < 0.25 · e.z`; `CALIBRATION_DISTANCE_MM = 500`; `MIN_CALIBRATION_SAMPLES = 15`; collection window 1000 ms; HFOV accepted range 30–120°; storage key `rototext.hfov.<presetId>`.
- Copy (verbatim): prompt *"Sit with your eyes 50 cm from the screen, facing it. Hold still and click Start."*; success *"Calibrated: HFOV 63.5°"* (with the actual value, 1 decimal); failure *"No steady face found — try again"*.
- `textContent` / `setAttribute` only — never `innerHTML` with dynamic values.
- Existing behaviour that must survive: mouse mode (`refresh()` on remeasure), Space guards, `starting` re-entrancy guard, `loopId` staleness, GPU→CPU rebuild, the text scene's constant-apparent-size correction.

## Review Focus

1. **Windowed (non-fullscreen) browser** — the box must match the browser viewport, not the whole screen, so its front edge stays on the window edges. → `viewportRectMm` test with a non-zero viewport origin, Task 2.
2. **Extreme or bad eye positions** (very close, behind the screen, NaN from a bad frame) — the renderer must never receive NaN/Infinity coordinates. → `projectPoint` fuzz test, Task 1.
3. **Stale or garbage saved calibration** (`"abc"`, `"NaN"`, `"999"` in localStorage) — must be ignored, not applied. → store range/parse test, Task 4.
4. **Tiny windows** narrower than one grid cell — grid generation must still include both edges and terminate. → `gridStops` edge-case tests, Task 2.
5. **Blinks / dropped detections during calibration** (zero or NaN iris sizes) — must be filtered, not drag the median. → `hfovFromIris` invalid-sample test, Task 3.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/geometry/perspective.ts` | `projectPoint` | 1 |
| `src/scene/targets.ts` | Box + target primitives, depth-cue styling, viewport rect in mm | 2 |
| `src/tracking/calibration.ts`, `src/tracking/eyeEstimator.ts` (edit) | HFOV solve; `largerIrisDiameterPx` | 3 |
| `src/calibrationStore.ts` | Per-preset HFOV persistence | 4 |
| `src/scene/svgRenderer.ts`, `index.html`, `src/styles.css`, `src/ui/demo.ts` | SVG renderer, markup and styles for the scene and top bar | 5 |
| `src/ui/sceneSwitch.ts`, `src/main.ts` | Targets/Text switch and integration | 6 |
| `src/ui/calibrateDialog.ts`, `src/ui/inset.ts`, `src/main.ts`, `index.html`, `src/styles.css` | Calibration UI and wiring | 7 |

---

### Task 1: Perspective point projection

**Files:**
- Create: `src/geometry/perspective.ts`
- Test: `tests/geometry/perspective.test.ts`

**Interfaces:**
- Consumes: `MIN_DEPTH_RATIO`, `MIN_EYE_Z_MM`, `projectToScreenPlane(eye: Vec3, q: Vec3): Vec3` from `src/geometry/projection.ts`; `screenMmToViewport(p: Vec3, frame: ScreenFrame): Point2`, `Point2`, `ScreenFrame` from `src/geometry/screenSpace.ts`; `vec3`, `Vec3` from `src/geometry/vec3.ts`.
- Produces: `projectPoint(eye: Vec3, q: Vec3, frame: ScreenFrame): Point2 | null` (viewport CSS px).

- [ ] **Step 1: Write the failing test** — `tests/geometry/perspective.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { projectPoint } from '../../src/geometry/perspective';
import { screenMmToViewport, type ScreenFrame } from '../../src/geometry/screenSpace';
import { vec3, type Vec3 } from '../../src/geometry/vec3';

const frame: ScreenFrame = { mmPerPx: 0.2, screenWidthPx: 1000, screenHeightPx: 800, viewportOriginPx: { x: 0, y: 0 } };

describe('projectPoint', () => {
  it('maps a point on the screen plane to itself', () => {
    const q = vec3(30, -20, 0);
    const p = projectPoint(vec3(100, 50, 500), q, frame)!;
    const expected = screenMmToViewport(q, frame);
    expect(p.x).toBeCloseTo(expected.x, 9);
    expect(p.y).toBeCloseTo(expected.y, 9);
  });

  it('pulls a point behind the screen toward the view centre for a frontal eye', () => {
    // t = 500 / 750 → screen point (33.33, 26.67) mm → viewport (666.67, 266.67) px.
    const p = projectPoint(vec3(0, 0, 500), vec3(50, 40, -250), frame)!;
    expect(p.x).toBeCloseTo(500 + (50 * (2 / 3)) / 0.2, 9);
    expect(p.y).toBeCloseTo(400 - (40 * (2 / 3)) / 0.2, 9);
  });

  it('gives motion parallax: eye moves right → far points move right, near points move left', () => {
    const left = vec3(0, 0, 500);
    const right = vec3(100, 0, 500);
    const far = vec3(0, 0, -200);
    const near = vec3(0, 0, 40);
    expect(projectPoint(right, far, frame)!.x).toBeGreaterThan(projectPoint(left, far, frame)!.x);
    expect(projectPoint(right, near, frame)!.x).toBeLessThan(projectPoint(left, near, frame)!.x);
  });

  it('returns null when the point is too close to the eye depth', () => {
    expect(projectPoint(vec3(0, 0, 500), vec3(0, 0, 400), frame)).toBeNull(); // 100 < 125
    expect(projectPoint(vec3(0, 0, 500), vec3(0, 0, 375), frame)).not.toBeNull(); // 125, not < 125
  });

  it('clamps the eye depth to 100 mm', () => {
    const q = vec3(20, 10, -100);
    expect(projectPoint(vec3(5, 5, 10), q, frame)).toEqual(projectPoint(vec3(5, 5, 100), q, frame));
    expect(projectPoint(vec3(5, 5, -300), q, frame)).toEqual(projectPoint(vec3(5, 5, 100), q, frame));
  });

  it('returns null for non-finite inputs', () => {
    expect(projectPoint(vec3(NaN, 0, 500), vec3(0, 0, 0), frame)).toBeNull();
    expect(projectPoint(vec3(0, 0, 500), vec3(0, Infinity, 0), frame)).toBeNull();
  });

  it('never returns NaN or Infinity for any eye position', () => {
    const points: Vec3[] = [vec3(-170, 110, -250), vec3(170, -110, 0), vec3(0, 0, 40)];
    let projected = 0;
    for (const x of [-3000, -400, 0, 400, 3000])
      for (const y of [-2000, 0, 2000])
        for (const z of [-500, 0, 1, 99, 100, 160, 500, 5000])
          for (const q of points) {
            const p = projectPoint(vec3(x, y, z), q, frame);
            if (p === null) continue;
            projected++;
            expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
          }
    expect(projected).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/geometry/perspective.test.ts`
Expected: FAIL — cannot resolve `../../src/geometry/perspective`.

- [ ] **Step 3: Write the implementation** — `src/geometry/perspective.ts`

```ts
import { MIN_DEPTH_RATIO, MIN_EYE_Z_MM, projectToScreenPlane } from './projection';
import { screenMmToViewport, type Point2, type ScreenFrame } from './screenSpace';
import { vec3, type Vec3 } from './vec3';

const isFiniteVec = (v: Vec3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/**
 * Where the ray from the eye through world point `q` meets the screen plane, in
 * viewport px. Null when the point is at, behind, or too close to the eye's depth.
 */
export function projectPoint(eye: Vec3, q: Vec3, frame: ScreenFrame): Point2 | null {
  if (!isFiniteVec(eye) || !isFiniteVec(q)) return null;
  const e = vec3(eye.x, eye.y, Math.max(eye.z, MIN_EYE_Z_MM));
  if (e.z - q.z < MIN_DEPTH_RATIO * e.z) return null;
  return screenMmToViewport(projectToScreenPlane(e, q), frame);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/perspective.ts tests/geometry/perspective.test.ts
git commit -m "feat: add perspective point projection"
```

---

### Task 2: Targets scene geometry

**Files:**
- Create: `src/scene/targets.ts`
- Test: `tests/scene/targets.test.ts`

**Interfaces:**
- Consumes: `viewportToScreenMm(p: Point2, frame: ScreenFrame): Vec3`, `ScreenFrame` from `src/geometry/screenSpace.ts`; `vec3`, `Vec3` from `src/geometry/vec3.ts`.
- Produces:
  - `BOX_DEPTH_MM = 250`, `GRID_MM = 25`, `DISC_SEGMENTS = 48`, `RING_RED = '#e5484d'`, `RING_WHITE = '#f4f1ea'`
  - `interface ViewportRectMm { left: number; right: number; top: number; bottom: number }`
  - `type Primitive = { kind: 'line'; a: Vec3; b: Vec3; depth: number; role: 'grid' | 'stick' } | { kind: 'polygon'; points: Vec3[]; depth: number; fill: string }`
  - `interface TargetSpec { fx: number; fy: number; z: number; r: number }`, `TARGETS: readonly TargetSpec[]`
  - `viewportRectMm(frame: ScreenFrame, innerWidth: number, innerHeight: number): ViewportRectMm`
  - `rectCenter(rect: ViewportRectMm): Vec3` (z = 0)
  - `gridStops(a: number, b: number, step: number): number[]`
  - `buildTargetsScene(rect: ViewportRectMm): Primitive[]` (painter's order, far → near)
  - `depthOpacity(depth: number): number`, `gridLineWidth(depth: number): number`

- [ ] **Step 1: Write the failing test** — `tests/scene/targets.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { ScreenFrame } from '../../src/geometry/screenSpace';
import type { Vec3 } from '../../src/geometry/vec3';
import {
  BOX_DEPTH_MM,
  buildTargetsScene,
  depthOpacity,
  DISC_SEGMENTS,
  gridLineWidth,
  gridStops,
  rectCenter,
  RING_RED,
  RING_WHITE,
  TARGETS,
  viewportRectMm,
  type Primitive,
  type ViewportRectMm,
} from '../../src/scene/targets';

const rect: ViewportRectMm = { left: -150, right: 150, top: 100, bottom: -100 };
const D = BOX_DEPTH_MM;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
type Line = Extract<Primitive, { kind: 'line' }>;

describe('viewportRectMm', () => {
  const frame: ScreenFrame = { mmPerPx: 0.2, screenWidthPx: 1000, screenHeightPx: 800, viewportOriginPx: { x: 0, y: 0 } };

  it('is the screen rectangle when the viewport fills the screen', () => {
    expect(viewportRectMm(frame, 1000, 800)).toEqual({ left: -100, right: 100, top: 80, bottom: -80 });
  });

  it('follows a windowed viewport, not the whole screen', () => {
    const windowed: ScreenFrame = { ...frame, viewportOriginPx: { x: 100, y: 50 } };
    const r = viewportRectMm(windowed, 600, 500);
    expect(r.left).toBeCloseTo((100 - 500) * 0.2, 9);
    expect(r.right).toBeCloseTo((700 - 500) * 0.2, 9);
    expect(r.top).toBeCloseTo((400 - 50) * 0.2, 9);
    expect(r.bottom).toBeCloseTo((400 - 550) * 0.2, 9);
  });

  it('has its centre in the middle of the rectangle', () => {
    expect(rectCenter(rect)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('gridStops', () => {
  it('steps from the low end and always includes both ends', () => {
    expect(gridStops(0, 60, 25)).toEqual([0, 25, 50, 60]);
    expect(gridStops(60, 0, 25)).toEqual([0, 25, 50, 60]);
    expect(gridStops(0, 50, 25)).toEqual([0, 25, 50]);
  });

  it('handles spans smaller than one step and zero spans', () => {
    expect(gridStops(0, 10, 25)).toEqual([0, 10]);
    expect(gridStops(5, 5, 25)).toEqual([5]);
  });
});

describe('buildTargetsScene', () => {
  const scene = buildTargetsScene(rect);
  const lines = scene.filter((p): p is Line => p.kind === 'line');
  const grid = lines.filter((l) => l.role === 'grid');
  const sticks = lines.filter((l) => l.role === 'stick');
  const discs = scene.filter((p) => p.kind === 'polygon');

  it('is deterministic', () => {
    expect(buildTargetsScene(rect)).toEqual(scene);
  });

  it('has 8 targets of 3 discs each, and one stick per target', () => {
    expect(TARGETS).toHaveLength(8);
    expect(discs).toHaveLength(24);
    expect(sticks).toHaveLength(8);
    for (const d of discs) {
      if (d.kind !== 'polygon') continue;
      expect(d.points).toHaveLength(DISC_SEGMENTS);
      expect([RING_RED, RING_WHITE]).toContain(d.fill);
    }
  });

  it('keeps targets inside the box, with depths in −250…+40 and some in front of the glass', () => {
    for (const s of sticks) {
      expect(s.a.x).toBeGreaterThan(rect.left);
      expect(s.a.x).toBeLessThan(rect.right);
      expect(s.a.y).toBeGreaterThan(rect.bottom);
      expect(s.a.y).toBeLessThan(rect.top);
      expect(s.a.z).toBeGreaterThanOrEqual(-D);
      expect(s.a.z).toBeLessThanOrEqual(40);
      expect(s.b).toEqual({ x: s.a.x, y: s.a.y, z: -D });
    }
    expect(sticks.some((s) => s.a.z > 0)).toBe(true);
  });

  it('puts every grid line on a wall plane and inside the box', () => {
    const onWall = (a: Vec3, b: Vec3) =>
      (near(a.z, -D) && near(b.z, -D)) ||
      (near(a.y, rect.bottom) && near(b.y, rect.bottom)) ||
      (near(a.y, rect.top) && near(b.y, rect.top)) ||
      (near(a.x, rect.left) && near(b.x, rect.left)) ||
      (near(a.x, rect.right) && near(b.x, rect.right));
    const inside = (p: Vec3) =>
      p.x >= rect.left - 1e-9 && p.x <= rect.right + 1e-9 && p.y >= rect.bottom - 1e-9 && p.y <= rect.top + 1e-9 && p.z >= -D - 1e-9 && p.z <= 1e-9;
    expect(grid.length).toBeGreaterThan(0);
    for (const l of grid) {
      expect(onWall(l.a, l.b)).toBe(true);
      expect(inside(l.a) && inside(l.b)).toBe(true);
    }
  });

  it("includes the box's front edges exactly on the viewport rectangle", () => {
    const has = (a: Vec3, b: Vec3) =>
      grid.some(
        (l) =>
          (near(l.a.x, a.x) && near(l.a.y, a.y) && near(l.a.z, a.z) && near(l.b.x, b.x) && near(l.b.y, b.y) && near(l.b.z, b.z)) ||
          (near(l.a.x, b.x) && near(l.a.y, b.y) && near(l.a.z, b.z) && near(l.b.x, a.x) && near(l.b.y, a.y) && near(l.b.z, a.z)),
      );
    const { left: L, right: R, top: T, bottom: B } = rect;
    expect(has({ x: L, y: B, z: 0 }, { x: R, y: B, z: 0 })).toBe(true);
    expect(has({ x: L, y: T, z: 0 }, { x: R, y: T, z: 0 })).toBe(true);
    expect(has({ x: L, y: B, z: 0 }, { x: L, y: T, z: 0 })).toBe(true);
    expect(has({ x: R, y: B, z: 0 }, { x: R, y: T, z: 0 })).toBe(true);
  });

  it('is in painter order: grid, then sticks, then discs, each far to near', () => {
    const rank = (p: Primitive) => (p.kind === 'polygon' ? 2 : p.role === 'stick' ? 1 : 0);
    for (let i = 1; i < scene.length; i++) {
      const prev = scene[i - 1]!;
      const cur = scene[i]!;
      expect(rank(cur)).toBeGreaterThanOrEqual(rank(prev));
      if (rank(cur) === rank(prev)) expect(cur.depth).toBeGreaterThanOrEqual(prev.depth);
    }
  });

  it('draws each target largest disc first', () => {
    const first = discs.slice(0, 3);
    const radius = (p: Primitive) => {
      if (p.kind !== 'polygon') return 0;
      const c = p.points.reduce((s, q) => ({ x: s.x + q.x / DISC_SEGMENTS, y: s.y + q.y / DISC_SEGMENTS }), { x: 0, y: 0 });
      return Math.hypot(p.points[0]!.x - c.x, p.points[0]!.y - c.y);
    };
    expect(radius(first[0]!)).toBeGreaterThan(radius(first[1]!));
    expect(radius(first[1]!)).toBeGreaterThan(radius(first[2]!));
  });
});

describe('depth cue', () => {
  it('fades and thins with depth behind the screen, full strength in front', () => {
    expect(depthOpacity(0)).toBe(1);
    expect(depthOpacity(30)).toBe(1);
    expect(depthOpacity(-125)).toBeCloseTo(0.75, 12);
    expect(depthOpacity(-250)).toBeCloseTo(0.5, 12);
    expect(gridLineWidth(0)).toBeCloseTo(1.5, 12);
    expect(gridLineWidth(-250)).toBeCloseTo(0.75, 12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scene/targets.test.ts`
Expected: FAIL — cannot resolve `../../src/scene/targets`.

- [ ] **Step 3: Write the implementation** — `src/scene/targets.ts`

```ts
import { viewportToScreenMm, type ScreenFrame } from '../geometry/screenSpace';
import { vec3, type Vec3 } from '../geometry/vec3';

export const BOX_DEPTH_MM = 250;
export const GRID_MM = 25;
export const DISC_SEGMENTS = 48;
export const RING_RED = '#e5484d';
export const RING_WHITE = '#f4f1ea';

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

function boxGrid(r: ViewportRectMm): Primitive[] {
  const D = -BOX_DEPTH_MM;
  const xs = gridStops(r.left, r.right, GRID_MM);
  const ys = gridStops(r.bottom, r.top, GRID_MM);
  const zs = gridStops(D, 0, GRID_MM);
  const out: Primitive[] = [];
  // Back wall.
  for (const x of xs) out.push(line(vec3(x, r.bottom, D), vec3(x, r.top, D), 'grid'));
  for (const y of ys) out.push(line(vec3(r.left, y, D), vec3(r.right, y, D), 'grid'));
  // Floor and ceiling.
  for (const y of [r.bottom, r.top]) {
    for (const x of xs) out.push(line(vec3(x, y, 0), vec3(x, y, D), 'grid'));
    for (const z of zs) out.push(line(vec3(r.left, y, z), vec3(r.right, y, z), 'grid'));
  }
  // Side walls.
  for (const x of [r.left, r.right]) {
    for (const y of ys) out.push(line(vec3(x, y, 0), vec3(x, y, D), 'grid'));
    for (const z of zs) out.push(line(vec3(x, r.bottom, z), vec3(x, r.top, z), 'grid'));
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

export function gridLineWidth(depth: number): number {
  const k = Math.min(1, Math.max(0, -depth / BOX_DEPTH_MM));
  return 1.5 - 0.75 * k;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/scene/targets.ts tests/scene/targets.test.ts
git commit -m "feat: add box and ring-target scene geometry"
```

---

### Task 3: Calibration math and iris helper

**Files:**
- Create: `src/tracking/calibration.ts`
- Modify: `src/tracking/eyeEstimator.ts` (add `largerIrisDiameterPx`, use it in `estimateEye`)
- Test: `tests/tracking/calibration.test.ts`, `tests/tracking/eyeEstimator.test.ts` (add one `describe`)

**Interfaces:**
- Consumes: `DEFAULT_IRIS_DIAMETER_MM` from `src/settings.ts`; existing `irisDiameterPx`, `RIGHT_IRIS`, `LEFT_IRIS`, `LANDMARK_COUNT`, `Landmark2D`, `focalLengthPx` in `eyeEstimator.ts`.
- Produces:
  - `largerIrisDiameterPx(lm: readonly Landmark2D[], w: number, h: number): number` (0 when fewer than 478 landmarks)
  - `CALIBRATION_DISTANCE_MM = 500`, `MIN_CALIBRATION_SAMPLES = 15`, `MIN_HFOV_DEG = 30`, `MAX_HFOV_DEG = 120`
  - `median(values: readonly number[]): number`
  - `hfovFromIris(irisPxSamples: readonly number[], frameWidthPx: number, irisDiameterMm?: number, distanceMm?: number): number | null`

- [ ] **Step 1: Write the failing tests**

`tests/tracking/calibration.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { focalLengthPx } from '../../src/tracking/eyeEstimator';
import {
  CALIBRATION_DISTANCE_MM,
  hfovFromIris,
  median,
  MIN_CALIBRATION_SAMPLES,
} from '../../src/tracking/calibration';

const W = 1280;
/** The iris size a camera with this HFOV would see at the calibration distance. */
const irisPxFor = (hfovDeg: number) => (focalLengthPx(W, hfovDeg) * 11.7) / CALIBRATION_DISTANCE_MM;

describe('median', () => {
  it('handles odd and even counts without mutating the input', () => {
    const values = [5, 1, 3];
    expect(median(values)).toBe(3);
    expect(values).toEqual([5, 1, 3]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('hfovFromIris', () => {
  it('recovers a known field of view', () => {
    const samples = Array.from({ length: 20 }, () => irisPxFor(63.5));
    expect(hfovFromIris(samples, W)).toBeCloseTo(63.5, 1);
  });

  it('is not moved by one outlier frame', () => {
    const samples = [...Array.from({ length: 19 }, () => irisPxFor(70)), irisPxFor(70) * 3];
    expect(hfovFromIris(samples, W)).toBeCloseTo(70, 1);
  });

  it('ignores zero and non-finite samples from blinks or dropped detections', () => {
    const good = Array.from({ length: MIN_CALIBRATION_SAMPLES }, () => irisPxFor(60));
    expect(hfovFromIris([...good, 0, 0, 0, NaN, Infinity, -4], W)).toBeCloseTo(60, 1);
    expect(hfovFromIris([...good.slice(1), 0, NaN], W)).toBeNull();
  });

  it('needs at least the minimum number of samples', () => {
    expect(hfovFromIris(Array.from({ length: MIN_CALIBRATION_SAMPLES - 1 }, () => irisPxFor(65)), W)).toBeNull();
    expect(hfovFromIris([], W)).toBeNull();
  });

  it('rejects results outside 30–120°', () => {
    expect(hfovFromIris(Array.from({ length: 20 }, () => irisPxFor(25)), W)).toBeNull();
    expect(hfovFromIris(Array.from({ length: 20 }, () => irisPxFor(130)), W)).toBeNull();
  });
});
```

Add to `tests/tracking/eyeEstimator.test.ts` — extend the import list with `largerIrisDiameterPx`, and append:
```ts
describe('largerIrisDiameterPx', () => {
  it('is the diameter of the larger iris', () => {
    const eye = vec3(0, 0, 400);
    const lm = synthLandmarks(eye, landscape, { left: { sx: 0.8, sy: 0.8 } });
    const expected = (focalLengthPx(landscape.frameWidthPx, landscape.hfovDeg) * landscape.irisDiameterMm) / eye.z;
    expect(largerIrisDiameterPx(lm, landscape.frameWidthPx, landscape.frameHeightPx)).toBeCloseTo(expected, 9);
  });

  it('is 0 without the iris landmarks', () => {
    expect(largerIrisDiameterPx(synthLandmarks(vec3(0, 0, 400), landscape).slice(0, 468), 640, 480)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/tracking/calibration.test.ts tests/tracking/eyeEstimator.test.ts`
Expected: FAIL — cannot resolve `../../src/tracking/calibration`; `largerIrisDiameterPx` is not a function.

- [ ] **Step 3: Write the implementations**

`src/tracking/calibration.ts`:
```ts
import { DEFAULT_IRIS_DIAMETER_MM } from '../settings';

export const CALIBRATION_DISTANCE_MM = 500;
export const MIN_CALIBRATION_SAMPLES = 15;
export const MIN_HFOV_DEG = 30;
export const MAX_HFOV_DEG = 120;

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The camera's horizontal field of view implied by the iris sizes seen while the
 * viewer sits at `distanceMm`. Null when there are too few valid samples or the
 * result is implausible.
 */
export function hfovFromIris(
  irisPxSamples: readonly number[],
  frameWidthPx: number,
  irisDiameterMm: number = DEFAULT_IRIS_DIAMETER_MM,
  distanceMm: number = CALIBRATION_DISTANCE_MM,
): number | null {
  const valid = irisPxSamples.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length < MIN_CALIBRATION_SAMPLES) return null;
  const focalPx = (distanceMm * median(valid)) / irisDiameterMm;
  const hfov = (2 * Math.atan(frameWidthPx / 2 / focalPx) * 180) / Math.PI;
  return Number.isFinite(hfov) && hfov >= MIN_HFOV_DEG && hfov <= MAX_HFOV_DEG ? hfov : null;
}
```

`src/tracking/eyeEstimator.ts` — add after `irisDiameterPx`:
```ts
/** The larger iris diameter in px: head yaw foreshortens the farther iris. */
export function largerIrisDiameterPx(lm: readonly Landmark2D[], w: number, h: number): number {
  if (lm.length < LANDMARK_COUNT) return 0;
  return Math.max(irisDiameterPx(lm, RIGHT_IRIS, w, h), irisDiameterPx(lm, LEFT_IRIS, w, h));
}
```
and in `estimateEye` replace the two lines
```ts
  // Head yaw foreshortens the farther iris, so trust the larger one.
  const irisPx = Math.max(irisDiameterPx(lm, RIGHT_IRIS, w, h), irisDiameterPx(lm, LEFT_IRIS, w, h));
```
with
```ts
  const irisPx = largerIrisDiameterPx(lm, w, h);
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/tracking/calibration.ts src/tracking/eyeEstimator.ts tests/tracking/calibration.test.ts tests/tracking/eyeEstimator.test.ts
git commit -m "feat: add field-of-view calibration math"
```

---

### Task 4: Calibration store

**Files:**
- Create: `src/calibrationStore.ts`
- Test: `tests/calibrationStore.test.ts`

**Interfaces:**
- Consumes: `MIN_HFOV_DEG`, `MAX_HFOV_DEG` from `src/tracking/calibration.ts`.
- Produces: `interface CalibrationStore { load(presetId: string): number | null; save(presetId: string, hfovDeg: number): void; clear(presetId: string): void }`, `createCalibrationStore(getStorage: () => Storage | undefined): CalibrationStore`, `calibrationKey(presetId: string): string`.

- [ ] **Step 1: Write the failing test** — `tests/calibrationStore.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { calibrationKey, createCalibrationStore } from '../src/calibrationStore';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const throwing = (): Storage => {
  const boom = () => {
    throw new Error('SecurityError');
  };
  return { getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 } as unknown as Storage;
};

describe('createCalibrationStore', () => {
  it('round-trips per preset', () => {
    const storage = memoryStorage();
    const store = createCalibrationStore(() => storage);
    expect(store.load('mbp-16')).toBeNull();
    store.save('mbp-16', 63.5);
    store.save('mba-13', 71);
    expect(store.load('mbp-16')).toBe(63.5);
    expect(store.load('mba-13')).toBe(71);
    expect(storage.getItem(calibrationKey('mbp-16'))).toBe('63.5');
    store.clear('mbp-16');
    expect(store.load('mbp-16')).toBeNull();
    expect(store.load('mba-13')).toBe(71);
  });

  it('ignores garbage and out-of-range saved values', () => {
    const storage = memoryStorage();
    const store = createCalibrationStore(() => storage);
    for (const bad of ['abc', 'NaN', '', '999', '10']) {
      storage.setItem(calibrationKey('mbp-16'), bad);
      expect(store.load('mbp-16')).toBeNull();
    }
  });

  it('behaves as empty when storage throws, is missing, or cannot be reached', () => {
    for (const store of [
      createCalibrationStore(throwing),
      createCalibrationStore(() => undefined),
      createCalibrationStore(() => {
        throw new Error('blocked');
      }),
    ]) {
      expect(() => store.save('mbp-16', 63.5)).not.toThrow();
      expect(store.load('mbp-16')).toBeNull();
      expect(() => store.clear('mbp-16')).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/calibrationStore.test.ts`
Expected: FAIL — cannot resolve `../src/calibrationStore`.

- [ ] **Step 3: Write the implementation** — `src/calibrationStore.ts`

```ts
import { MAX_HFOV_DEG, MIN_HFOV_DEG } from './tracking/calibration';

export interface CalibrationStore {
  load(presetId: string): number | null;
  save(presetId: string, hfovDeg: number): void;
  clear(presetId: string): void;
}

export const calibrationKey = (presetId: string) => `rototext.hfov.${presetId}`;

/**
 * Per-preset calibrated HFOV. Storage can be missing or throw (private windows,
 * blocked site data); then the store behaves as empty and calibration only lasts
 * for the session.
 */
export function createCalibrationStore(getStorage: () => Storage | undefined): CalibrationStore {
  const storage = (): Storage | undefined => {
    try {
      return getStorage();
    } catch {
      return undefined;
    }
  };
  return {
    load(presetId) {
      try {
        const raw = storage()?.getItem(calibrationKey(presetId));
        if (raw == null || raw === '') return null;
        const value = Number(raw);
        return Number.isFinite(value) && value >= MIN_HFOV_DEG && value <= MAX_HFOV_DEG ? value : null;
      } catch {
        return null;
      }
    },
    save(presetId, hfovDeg) {
      try {
        storage()?.setItem(calibrationKey(presetId), String(hfovDeg));
      } catch {
        // Storage unavailable: the value still applies for this session.
      }
    },
    clear(presetId) {
      try {
        storage()?.removeItem(calibrationKey(presetId));
      } catch {
        // Nothing to clear.
      }
    },
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/calibrationStore.ts tests/calibrationStore.test.ts
git commit -m "feat: add per-preset calibration store"
```

---

### Task 5: SVG renderer, scene markup and styles

**Files:**
- Create: `src/scene/svgRenderer.ts`
- Modify: `index.html`, `src/styles.css`, `src/ui/demo.ts`

**Interfaces:**
- Consumes: `projectPoint` (Task 1); `Primitive`, `depthOpacity`, `gridLineWidth` (Task 2); `ScreenFrame`, `Vec3`.
- Produces:
  - `interface SceneRenderer { setScene(primitives: readonly Primitive[]): void; render(eye: Vec3, frame: ScreenFrame): void }`, `createSvgRenderer(svg: SVGSVGElement): SceneRenderer`
  - DOM: `<header id="topbar">` containing `#follow-toggle`; `<svg id="scene">`; `body[data-scene]` CSS switching
  - `DemoElements` gains `topbar: HTMLElement` and `scene: SVGSVGElement`

This task is DOM-only (no unit tests; Vitest runs in Node). Gates: typecheck, the existing suite, and build. `main.ts` is not changed here, so the app still runs the text scene; the SVG is hidden until Task 6 sets `body[data-scene]`.

- [ ] **Step 1: Create `src/scene/svgRenderer.ts`**

```ts
import { projectPoint } from '../geometry/perspective';
import type { ScreenFrame } from '../geometry/screenSpace';
import type { Vec3 } from '../geometry/vec3';
import { depthOpacity, gridLineWidth, type Primitive } from './targets';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID_COLOR = '#8a8f98';
const STICK_COLOR = '#f4f1ea';
const STICK_WIDTH = 1.25;

export interface SceneRenderer {
  /** Replace the scene; creates one SVG element per primitive, in painter's order. */
  setScene(primitives: readonly Primitive[]): void;
  /** Project every primitive from `eye` and update the SVG in place. */
  render(eye: Vec3, frame: ScreenFrame): void;
}

const px = (v: number) => v.toFixed(2);

export function createSvgRenderer(svg: SVGSVGElement): SceneRenderer {
  let items: { prim: Primitive; el: SVGElement }[] = [];

  return {
    setScene(primitives) {
      items = primitives.map((prim) => {
        if (prim.kind === 'line') {
          const el = document.createElementNS(SVG_NS, 'line');
          el.setAttribute('stroke', prim.role === 'grid' ? GRID_COLOR : STICK_COLOR);
          el.setAttribute('stroke-width', String(prim.role === 'grid' ? gridLineWidth(prim.depth) : STICK_WIDTH));
          el.setAttribute('stroke-linecap', 'round');
          el.setAttribute('opacity', String(depthOpacity(prim.depth)));
          return { prim, el };
        }
        const el = document.createElementNS(SVG_NS, 'polygon');
        el.setAttribute('fill', prim.fill);
        el.setAttribute('opacity', String(depthOpacity(prim.depth)));
        return { prim, el };
      });
      svg.replaceChildren(...items.map((i) => i.el));
    },

    render(eye, frame) {
      for (const { prim, el } of items) {
        if (prim.kind === 'line') {
          const a = projectPoint(eye, prim.a, frame);
          const b = projectPoint(eye, prim.b, frame);
          if (!a || !b) {
            el.setAttribute('visibility', 'hidden');
            continue;
          }
          el.setAttribute('visibility', 'visible');
          el.setAttribute('x1', px(a.x));
          el.setAttribute('y1', px(a.y));
          el.setAttribute('x2', px(b.x));
          el.setAttribute('y2', px(b.y));
          continue;
        }
        let points = '';
        let visible = true;
        for (const q of prim.points) {
          const p = projectPoint(eye, q, frame);
          if (!p) {
            visible = false;
            break;
          }
          points += `${px(p.x)},${px(p.y)} `;
        }
        el.setAttribute('visibility', visible ? 'visible' : 'hidden');
        if (visible) el.setAttribute('points', points);
      }
    },
  };
}
```

- [ ] **Step 2: Update `index.html` `<body>`**

Replace the current `<main id="stage">…</main>` block with:
```html
    <header id="topbar">
      <button type="button" id="follow-toggle" aria-pressed="true">Following you</button>
    </header>
    <main id="stage">
      <div class="text-box" id="corrected-box">
        <h1 class="headline" id="corrected">Read me from anywhere</h1>
      </div>
    </main>
    <svg id="scene" aria-hidden="true"></svg>
```
(Leave `#banner`, `#inset`, `#debug` and the script tag unchanged.)

- [ ] **Step 3: Update `src/styles.css`**

Directly after the existing `#follow-toggle[aria-pressed='false'] { … }` rule, add:
```css
#topbar {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  z-index: 6;
}

.segmented {
  display: flex;
  border: 1px solid var(--rule);
  border-radius: 999px;
  overflow: hidden;
  background: var(--panel);
}

.segmented button {
  font: inherit;
  font-size: 0.85rem;
  padding: 0.45rem 0.9rem;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.segmented button[aria-pressed='true'] {
  background: var(--rule);
  color: var(--fg);
}

#scene {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
}

body[data-scene='targets'] #stage {
  display: none;
}

body:not([data-scene='targets']) #scene {
  display: none;
}
```

- [ ] **Step 4: Update `src/ui/demo.ts`**

Add to `DemoElements`:
```ts
  topbar: HTMLElement;
  scene: SVGSVGElement;
```
In `getDemoElements()`, add a scene lookup before the `return` and the two fields to the returned object:
```ts
  const scene = document.getElementById('scene');
  if (!(scene instanceof SVGSVGElement)) throw new Error('Missing #scene');
```
```ts
    topbar: byId('topbar'),
    scene,
```

- [ ] **Step 5: Run checks**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests PASS; `tsc` exits 0; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/scene/svgRenderer.ts index.html src/styles.css src/ui/demo.ts
git commit -m "feat: add SVG scene renderer, top bar and scene markup"
```

---

### Task 6: Scene switch and integration

**Files:**
- Create: `src/ui/sceneSwitch.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `buildTargetsScene`, `viewportRectMm`, `rectCenter`, `ViewportRectMm` (Task 2); `createSvgRenderer` (Task 5); `els.topbar`, `els.scene` (Task 5).
- Produces: `type SceneName = 'targets' | 'text'`, `interface SceneSwitch { set(scene: SceneName): void; onChange(handler: (scene: SceneName) => void): void }`, `createSceneSwitch(root: HTMLElement, initial: SceneName): SceneSwitch`. In `main.ts`: `scene`, `sceneRect`, `renderer`, `viewCenter()`.

- [ ] **Step 1: Create `src/ui/sceneSwitch.ts`**

```ts
export type SceneName = 'targets' | 'text';

export interface SceneSwitch {
  set(scene: SceneName): void;
  onChange(handler: (scene: SceneName) => void): void;
}

const LABELS: Record<SceneName, string> = { targets: 'Targets', text: 'Text' };

/** A two-button segmented control, prepended to `root`. */
export function createSceneSwitch(root: HTMLElement, initial: SceneName): SceneSwitch {
  let handler: ((scene: SceneName) => void) | null = null;
  const buttons = (Object.keys(LABELS) as SceneName[]).map((name) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = LABELS[name];
    button.dataset.scene = name;
    // A mouse click must not leave focus here, or Space would re-click it.
    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', () => {
      show(name);
      handler?.(name);
    });
    return button;
  });
  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Scene');
  group.append(...buttons);
  root.prepend(group);

  function show(scene: SceneName): void {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.scene === scene));
  }

  show(initial);
  return {
    set: show,
    onChange(next) {
      handler = next;
    },
  };
}
```

- [ ] **Step 2: Wire it into `src/main.ts`** (read the whole file first; preserve everything not mentioned)

Add imports:
```ts
import { createSvgRenderer } from './scene/svgRenderer';
import { buildTargetsScene, rectCenter, viewportRectMm } from './scene/targets';
import { createSceneSwitch, type SceneName } from './ui/sceneSwitch';
```

Immediately after the line `let layout = measureLayout(els.correctedBox);`, add:
```ts
let scene: SceneName = 'targets';
document.body.dataset.scene = scene;
let sceneRect = viewportRectMm(frame, window.innerWidth, window.innerHeight);
const renderer = createSvgRenderer(els.scene);
renderer.setScene(buildTargetsScene(sceneRect));
```

Replace the existing `headlineCenter` / `restingEye` definitions:
```ts
const headlineCenter = () => layoutToScreenRect(layout, frame).center;
// Resting at the size reference distance gives the identity transform.
const restingEye = () => add(headlineCenter(), vec3(0, 0, settings.referenceDistanceMm));
```
with:
```ts
const headlineCenter = () => layoutToScreenRect(layout, frame).center;
/** What the viewer is looking at: the headline (text scene) or the box's front face. */
const viewCenter = () => (scene === 'text' ? headlineCenter() : rectCenter(sceneRect));
// Resting at the size reference distance gives the identity transform (text scene)
// and the straight-on view (targets scene).
const restingEye = () => add(viewCenter(), vec3(0, 0, settings.referenceDistanceMm));
```

Replace the body of `render(eye)` up to (not including) `inset.update({` — i.e. the `if (following) { … } else { … }` block and the `const stats = …` line — with:
```ts
  lastEye = eye;
  if (scene === 'targets') {
    renderer.render(following ? eye : restingEye(), frame);
  } else if (following) {
    // A null result means a degenerate pose: keep the last good transform.
    const t = computeCorrection(eye, layout, frame, { referenceDistanceMm: settings.referenceDistanceMm });
    if (t) lastTransform = t;
    els.corrected.style.transform = lastTransform;
  } else {
    els.corrected.style.transform = 'none';
  }
  const stats = viewingStats(eye, viewCenter());
```
(The existing `lastEye = eye;` first line is part of the replaced region — keep exactly one.)

In `remeasure()`, after `layout = measureLayout(els.correctedBox);` add:
```ts
  sceneRect = viewportRectMm(frame, window.innerWidth, window.innerHeight);
  renderer.setScene(buildTargetsScene(sceneRect));
```

After the line `els.followToggle.addEventListener('click', toggleFollowing);` add:
```ts
createSceneSwitch(els.topbar, scene).onChange((next) => {
  scene = next;
  document.body.dataset.scene = next;
  // The text stage was display:none, so its layout must be measured now.
  remeasure();
});
```

- [ ] **Step 3: Run checks**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests PASS; `tsc` exits 0; build succeeds. Re-read all of `main.ts` once to confirm nothing else changed.

- [ ] **Step 4: Commit**

```bash
git add src/ui/sceneSwitch.ts src/main.ts
git commit -m "feat: make the targets scene the default with a Targets/Text switch"
```

- [ ] **Step 5: Manual check (Sean)** — `npm run dev`, open `http://localhost:5173`: the box grid fills the window with its front edge on the window edges; leaning/moving the mouse makes far grid lines and targets slide with the eye and front targets slide against it; **Static** freezes the straight-on view; **Text** shows the headline scene as before.

---

### Task 7: Calibration dialog and wiring

**Files:**
- Create: `src/ui/calibrateDialog.ts`
- Modify: `src/ui/inset.ts`, `src/main.ts`, `index.html`, `src/styles.css`

**Interfaces:**
- Consumes: `hfovFromIris`, `CALIBRATION_DISTANCE_MM` (Task 3); `largerIrisDiameterPx` (Task 3); `createCalibrationStore` (Task 4); `createDebugPanel(...)` returning `DebugPanel { set(s: Settings): void }` (existing); `findPreset` (existing).
- Produces:
  - `interface CalibrateDialog { open(): void; close(): void; setStatus(text: string): void; setBusy(busy: boolean): void; onStart(handler: () => void): void; onReset(handler: () => void): void }`, `createCalibrateDialog(root: HTMLElement): CalibrateDialog`
  - `Inset.onCalibrateButton(handler: () => void): void`; the Calibrate button is visible only in camera mode.

- [ ] **Step 1: Add the dialog container to `index.html`**

Directly after `<p id="banner" hidden></p>` add:
```html
    <div id="calibrate" role="dialog" aria-label="Calibrate camera" hidden></div>
```

- [ ] **Step 2: Add styles to `src/styles.css`** (directly after the `#banner { … }` rule)

```css
#calibrate {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(90vw, 26rem);
  padding: 1rem 1.25rem;
  background: var(--panel);
  border: 1px solid var(--rule);
  border-radius: 12px;
  z-index: 11;
  font-size: 0.95rem;
}

#calibrate .status {
  color: var(--accent);
  min-height: 1.4em;
}

#calibrate button {
  font: inherit;
  background: var(--rule);
  color: var(--fg);
  border: 0;
  border-radius: 6px;
  padding: 0.4rem 0.9rem;
  margin-right: 0.5rem;
  cursor: pointer;
}

#calibrate .reset {
  background: transparent;
  color: var(--muted);
  text-decoration: underline;
  padding: 0.4rem 0;
}
```

- [ ] **Step 3: Create `src/ui/calibrateDialog.ts`**

```ts
export interface CalibrateDialog {
  open(): void;
  close(): void;
  setStatus(text: string): void;
  /** Disable Start while samples are being collected. */
  setBusy(busy: boolean): void;
  onStart(handler: () => void): void;
  onReset(handler: () => void): void;
}

const PROMPT = 'Sit with your eyes 50 cm from the screen, facing it. Hold still and click Start.';

export function createCalibrateDialog(root: HTMLElement): CalibrateDialog {
  const prompt = document.createElement('p');
  prompt.textContent = PROMPT;
  const status = document.createElement('p');
  status.className = 'status';
  const start = document.createElement('button');
  start.type = 'button';
  start.textContent = 'Start';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset';
  reset.textContent = 'Reset to preset';
  for (const b of [start, cancel, reset]) b.addEventListener('mousedown', (e) => e.preventDefault());
  root.replaceChildren(prompt, status, start, cancel, reset);

  const dialog: CalibrateDialog = {
    open() {
      status.textContent = '';
      start.disabled = false;
      root.hidden = false;
    },
    close() {
      root.hidden = true;
    },
    setStatus(text) {
      status.textContent = text;
    },
    setBusy(busy) {
      start.disabled = busy;
    },
    onStart(handler) {
      start.addEventListener('click', handler);
    },
    onReset(handler) {
      reset.addEventListener('click', handler);
    },
  };
  cancel.addEventListener('click', () => dialog.close());
  return dialog;
}
```

- [ ] **Step 4: Add the Calibrate button to `src/ui/inset.ts`**

In the `Inset` interface add:
```ts
  onCalibrateButton(handler: () => void): void;
```
In `createInset`, after `fullscreenButton.hidden = !document.fullscreenEnabled;` add:
```ts
  const calibrateButton = make('button');
  calibrateButton.textContent = 'Calibrate';
```
Change the mousedown loop to cover all three buttons:
```ts
  for (const button of [modeButton, fullscreenButton, calibrateButton]) {
```
Change the `root.replaceChildren(...)` call to:
```ts
  root.replaceChildren(feed, readout, modeButton, fullscreenButton, calibrateButton);
```
In `update(info)`, after `feed.hidden = info.mode !== 'camera';` add:
```ts
      calibrateButton.hidden = info.mode !== 'camera';
```
In the returned object add:
```ts
    onCalibrateButton(handler) {
      calibrateButton.addEventListener('click', handler);
    },
```

- [ ] **Step 5: Wire calibration into `src/main.ts`** (read the whole file first; preserve everything not mentioned)

Add imports (merge with existing import lines where the module is already imported):
```ts
import { createCalibrationStore } from './calibrationStore';
import { CALIBRATION_DISTANCE_MM, hfovFromIris } from './tracking/calibration';
import { createCalibrateDialog } from './ui/calibrateDialog';
```
and add `largerIrisDiameterPx` to the existing `./tracking/eyeEstimator` import.

Replace the line
```ts
let settings = settingsFromPreset(guessPreset(readViewportEnv()));
```
with:
```ts
const calibrationStore = createCalibrationStore(() => window.localStorage);
/** A saved calibration for this preset overrides the preset's HFOV. */
function withSavedCalibration(s: Settings): Settings {
  const saved = calibrationStore.load(s.presetId);
  return saved === null ? s : { ...s, cameraHfovDeg: saved };
}
let settings = withSavedCalibration(settingsFromPreset(guessPreset(readViewportEnv())));
/** Iris sizes collected during a calibration run; null when not calibrating. */
let calibration: { samples: number[]; frameWidthPx: number } | null = null;
```

In `onVideoFrame`, directly after the line `eyePoint = face ? irisMidpoint(face) : null;` add:
```ts
  if (calibration && face) calibration.samples.push(largerIrisDiameterPx(face, video.videoWidth, video.videoHeight));
```

Replace:
```ts
function applySettings(next: Settings): void {
  settings = next;
  smoother.setParams({ minCutoff: next.minCutoff, beta: next.beta, dCutoff: 1 });
  remeasure();
}

createDebugPanel(els.debugBody, settings, applySettings);
```
with:
```ts
function applySettings(next: Settings): void {
  // Switching presets picks up that preset's saved calibration, if any.
  const resolved = next.presetId !== settings.presetId ? withSavedCalibration(next) : next;
  settings = resolved;
  smoother.setParams({ minCutoff: resolved.minCutoff, beta: resolved.beta, dCutoff: 1 });
  if (resolved !== next) panel.set(resolved);
  remeasure();
}

const panel = createDebugPanel(els.debugBody, settings, applySettings);

const CALIBRATION_WINDOW_MS = 1000;
const dialog = createCalibrateDialog(document.getElementById('calibrate')!);

function finishCalibration(): void {
  const run = calibration;
  calibration = null;
  dialog.setBusy(false);
  const hfov = run ? hfovFromIris(run.samples, run.frameWidthPx, settings.irisDiameterMm, CALIBRATION_DISTANCE_MM) : null;
  if (hfov === null) {
    dialog.setStatus('No steady face found — try again');
    return;
  }
  const rounded = Math.round(hfov * 10) / 10;
  calibrationStore.save(settings.presetId, rounded);
  const next = { ...settings, cameraHfovDeg: rounded };
  applySettings(next);
  panel.set(next);
  dialog.setStatus(`Calibrated: HFOV ${rounded.toFixed(1)}°`);
  setTimeout(() => dialog.close(), 1500);
}

dialog.onStart(() => {
  if (mode !== 'camera' || calibration) return;
  calibration = { samples: [], frameWidthPx: inset.video.videoWidth };
  dialog.setBusy(true);
  dialog.setStatus('Hold still…');
  setTimeout(finishCalibration, CALIBRATION_WINDOW_MS);
});

dialog.onReset(() => {
  calibrationStore.clear(settings.presetId);
  const preset = findPreset(settings.presetId);
  if (!preset) return;
  const next = { ...settings, cameraHfovDeg: preset.cameraHfovDeg };
  applySettings(next);
  panel.set(next);
  dialog.setStatus(`Reset to preset HFOV ${preset.cameraHfovDeg.toFixed(1)}°`);
});

inset.onCalibrateButton(() => dialog.open());
```

- [ ] **Step 6: Run checks**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests PASS; `tsc` exits 0; build succeeds. Re-read all of `main.ts` once to confirm nothing else changed and `panel` is declared before any call to `applySettings` can run (the debug panel only calls it on user input; `finishCalibration` and the reset handler run later).

- [ ] **Step 7: Commit**

```bash
git add src/ui/calibrateDialog.ts src/ui/inset.ts src/main.ts index.html src/styles.css
git commit -m "feat: add one-click field-of-view calibration"
```

- [ ] **Step 8: Manual check (Sean)** — in camera mode click **Calibrate**, sit at 50 cm, click **Start**: the status shows *Calibrated: HFOV …°*, the Tune slider moves to it, and after a reload the Tune JSON still shows the calibrated value. **Reset to preset** restores 70°.

---

## After all tasks

Run `npm test && npm run typecheck && npm run build && npm_config_cache="$TMPDIR/npm-cache" npm audit`, then `git push origin main` (outside the sandbox).
