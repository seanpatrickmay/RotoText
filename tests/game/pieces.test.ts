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
