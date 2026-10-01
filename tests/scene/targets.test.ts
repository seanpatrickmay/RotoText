import { describe, expect, it } from 'vitest';
import type { ScreenFrame } from '../../src/geometry/screenSpace';
import type { Vec3 } from '../../src/geometry/vec3';
import {
  BOX_DEPTH_MM,
  buildBoxGrid,
  buildTargetsScene,
  depthOpacity,
  DISC_SEGMENTS,
  fogColor,
  FOG_BG,
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

  it('has 8 targets of 3 discs each', () => {
    expect(TARGETS).toHaveLength(8);
    expect(discs).toHaveLength(24);
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
      expect(s.b.x).toBe(s.a.x);
      expect(s.b.y).toBe(s.a.y);
      expect(s.b.z).toBeLessThan(s.a.z);
    }
    expect(sticks.some((s) => s.a.z > 0)).toBe(true);
  });

  it("splits each target's stick into contiguous segments that together run from its disc back to the wall", () => {
    const byTarget = new Map<string, Line[]>();
    for (const s of sticks) {
      const key = `${s.a.x},${s.a.y}`;
      byTarget.set(key, [...(byTarget.get(key) ?? []), s]);
    }
    expect(byTarget.size).toBe(8);
    const tops: number[] = [];
    for (const segs of byTarget.values()) {
      segs.sort((p, q) => q.a.z - p.a.z);
      tops.push(segs[0]!.a.z);
      expect(segs[segs.length - 1]!.b.z).toBe(-D);
      for (let i = 1; i < segs.length; i++) expect(segs[i]!.a.z).toBe(segs[i - 1]!.b.z);
    }
    expect(tops.sort((p, q) => p - q)).toEqual(TARGETS.map((t) => t.z).sort((p, q) => p - q));
  });

  it('never lets a stick segment pass through a target depth', () => {
    for (const s of sticks) {
      for (const t of TARGETS) {
        expect(t.z < s.a.z && t.z > s.b.z).toBe(false);
      }
    }
    // Target 7's stick (z +25 to the wall) is cut at every farther target's depth.
    const seven = sticks.filter((s) => s.a.x === sticks.find((q) => q.a.z === 25)!.a.x);
    expect(seven.length).toBeGreaterThan(1);
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

  it('emits each grid segment once, in either direction', () => {
    const key = (p: Vec3) => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
    const seen = new Set<string>();
    for (const l of grid) {
      const [lo, hi] = [key(l.a), key(l.b)].sort();
      const k = `${lo}|${hi}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
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

  it('is in painter order: grid first, then sticks and discs together, far to near', () => {
    const firstOther = scene.findIndex((p) => !(p.kind === 'line' && p.role === 'grid'));
    expect(firstOther).toBeGreaterThan(0);
    expect(scene.slice(firstOther).every((p) => !(p.kind === 'line' && p.role === 'grid'))).toBe(true);
    for (let i = 1; i < scene.length; i++) {
      const prev = scene[i - 1]!;
      const cur = scene[i]!;
      const grids = (p: Primitive) => p.kind === 'line' && p.role === 'grid';
      if (grids(prev) === grids(cur)) expect(cur.depth).toBeGreaterThanOrEqual(prev.depth);
    }
  });

  it("paints a target's discs over the stick segment that ends at them, and a nearer stick over a farther disc", () => {
    const index = (p: Primitive) => scene.indexOf(p);
    for (const t of TARGETS) {
      const targetDiscs = discs.filter((d) => d.kind === 'polygon' && d.depth === t.z);
      for (const s of sticks) {
        if (s.b.z >= t.z) expect(index(s)).toBeGreaterThan(index(targetDiscs[0]!));
        else if (s.a.z <= t.z) expect(index(s)).toBeLessThan(index(targetDiscs[0]!));
      }
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

describe('fogColor', () => {
  it('leaves colours at or in front of the screen unchanged', () => {
    expect(fogColor(RING_RED, 0)).toBe(RING_RED);
    expect(fogColor(RING_WHITE, 40)).toBe(RING_WHITE);
  });

  it('mixes exactly half way to the background at the back wall', () => {
    expect(FOG_BG).toBe('#0e0f12');
    // (30,47,66) with (14,15,18): every channel sum is even, so the mix is exact.
    expect(fogColor('#1e2f42', -BOX_DEPTH_MM)).toBe('#161f2a');
  });

  it('always returns lowercase #rrggbb', () => {
    for (const hex of [RING_RED, RING_WHITE, '#000000', '#FFFFFF']) {
      for (const depth of [30, 0, -1, -90, -125, -250, -400]) {
        expect(fogColor(hex, depth)).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('buildBoxGrid', () => {
  it('is exactly the grid part of the targets scene, without targets or sticks', () => {
    const grid = buildBoxGrid(rect);
    expect(grid.length).toBeGreaterThan(0);
    expect(grid.every((p) => p.kind === 'line' && p.role === 'grid')).toBe(true);
    expect(buildTargetsScene(rect).slice(0, grid.length)).toEqual(grid);
  });
});
