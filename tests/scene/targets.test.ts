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
