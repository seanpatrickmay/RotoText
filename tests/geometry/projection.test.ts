import { describe, expect, it } from 'vitest';
import {
  apparentScale,
  clampEye,
  computeCorrection,
  MAX_APPARENT_SCALE,
  MAX_VIEW_ANGLE_DEG,
  MIN_APPARENT_SCALE,
  projectedQuad,
  solveHomography,
  toMatrix3d,
  viewingStats,
  type Quad,
} from '../../src/geometry/projection';
import {
  layoutToScreenRect,
  viewportToScreenMm,
  type ElementLayout,
  type Point2,
  type ScreenFrame,
} from '../../src/geometry/screenSpace';
import { add, dot, length, normalize, scale, sub, vec3, type Vec3 } from '../../src/geometry/vec3';

const frame: ScreenFrame = { mmPerPx: 0.2, screenWidthPx: 1000, screenHeightPx: 800, viewportOriginPx: { x: 0, y: 0 } };
/** 200×100 px (40×20 mm) element centred on the screen. */
const centred: ElementLayout = { left: 400, top: 350, width: 200, height: 100 };
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function parseMatrix(s: string | null): number[] {
  expect(s).not.toBeNull();
  const m = /^matrix3d\((.*)\)$/.exec(s!);
  expect(m).not.toBeNull();
  return m![1]!.split(',').map(Number);
}

function expectAllClose(actual: number[], expected: number[], tol = 1e-9) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(Math.abs(v - expected[i]!)).toBeLessThan(tol));
}

describe('computeCorrection', () => {
  it('is the identity when the eye is straight in front of the element', () => {
    expectAllClose(parseMatrix(computeCorrection(vec3(0, 0, 500), centred, frame)), IDENTITY);
  });

  it('is the identity for an off-centre element viewed straight on', () => {
    const offCentre: ElementLayout = { left: 100, top: 100, width: 200, height: 100 };
    const c = layoutToScreenRect(offCentre, frame).center;
    expectAllClose(parseMatrix(computeCorrection(vec3(c.x, c.y, 500), offCentre, frame)), IDENTITY);
  });

  it('matches the capped result for an eye beyond the angle cap and too close', () => {
    const eye = vec3(2000, 0, 50);
    const center = layoutToScreenRect(centred, frame).center;
    // Re-clamping an already-capped eye can differ by an ulp, so compare numerically.
    expectAllClose(
      parseMatrix(computeCorrection(eye, centred, frame)),
      parseMatrix(computeCorrection(clampEye(eye, center), centred, frame)),
    );
  });

  it('returns null when a large element at a steep angle would reach the eye', () => {
    const wide: ElementLayout = { left: 0, top: 300, width: 1000, height: 200 }; // 200 × 40 mm
    expect(computeCorrection(vec3(2000, 0, 100), wide, frame)).toBeNull();
  });

  it('never emits NaN or Infinity, whatever the eye position', () => {
    const xs = [-5000, -800, -200, 0, 200, 800, 5000];
    const ys = [-800, 0, 800];
    const zs = [-100, 0, 1, 50, 100, 300, 1000, 5000];
    const eyes: Vec3[] = [vec3(NaN, 0, 500), vec3(0, Infinity, 500), vec3(0, 0, -Infinity)];
    for (const x of xs) for (const y of ys) for (const z of zs) eyes.push(vec3(x, y, z));
    for (const eye of eyes) {
      const result = computeCorrection(eye, centred, frame);
      if (result === null) continue;
      const values = parseMatrix(result);
      expect(values).toHaveLength(16);
      for (const v of values) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('projectedQuad', () => {
  it('lands on a true w×h rectangle facing the eye when viewed from the eye', () => {
    const eye = vec3(150, 60, 400);
    const quad = projectedQuad(eye, centred, frame)!;
    expect(quad).not.toBeNull();
    const rect = layoutToScreenRect(centred, frame);
    const n = normalize(sub(eye, rect.center));
    // Cast a ray from the eye through each projected point onto the billboard plane.
    const hits = quad.map((p) => {
      const onScreen = viewportToScreenMm({ x: p.x + centred.left, y: p.y + centred.top }, frame);
      const dir = sub(onScreen, eye);
      const s = dot(sub(rect.center, eye), n) / dot(dir, n);
      return add(eye, scale(dir, s));
    });
    const dist = (a: Vec3, b: Vec3) => length(sub(a, b));
    expect(dist(hits[0]!, hits[1]!)).toBeCloseTo(rect.widthMm, 6);
    expect(dist(hits[1]!, hits[2]!)).toBeCloseTo(rect.heightMm, 6);
    expect(dist(hits[2]!, hits[3]!)).toBeCloseTo(rect.widthMm, 6);
    expect(dist(hits[3]!, hits[0]!)).toBeCloseTo(rect.heightMm, 6);
    expect(dist(hits[0]!, hits[2]!)).toBeCloseTo(dist(hits[1]!, hits[3]!), 6);
  });

  it('makes the far side taller than the near side', () => {
    const quad = projectedQuad(vec3(300, 0, 400), centred, frame)!; // eye to the right
    const leftEdge = quad[3].y - quad[0].y;
    const rightEdge = quad[2].y - quad[1].y;
    expect(leftEdge).toBeGreaterThan(rightEdge);
  });
});

describe('clampEye', () => {
  const origin = vec3(0, 0, 0);
  const angleDeg = (e: Vec3) => (Math.atan2(Math.hypot(e.x, e.y), e.z) * 180) / Math.PI;

  it('leaves an eye inside the cap unchanged', () => {
    expect(clampEye(vec3(100, 50, 400), origin)).toEqual(vec3(100, 50, 400));
  });

  it('pushes a too-close or behind-screen eye out to 100 mm', () => {
    expect(clampEye(vec3(0, 0, 20), origin).z).toBe(100);
    expect(clampEye(vec3(0, 0, -50), origin).z).toBe(100);
  });

  it('pulls a steep eye back onto the 75° cap, keeping its azimuth', () => {
    const c = clampEye(vec3(1000, 1000, 100), origin);
    expect(angleDeg(c)).toBeCloseTo(MAX_VIEW_ANGLE_DEG, 9);
    expect(c.x).toBeCloseTo(c.y, 9);
  });
});

describe('solveHomography', () => {
  const square: Quad<Point2> = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 },
  ];

  it('solves the identity', () => {
    expectAllClose(solveHomography(square, square)!, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('solves a translation', () => {
    const moved = square.map((p) => ({ x: p.x + 5, y: p.y + 7 })) as Quad<Point2>;
    expectAllClose(solveHomography(square, moved)!, [1, 0, 5, 0, 1, 7, 0, 0, 1]);
  });

  it('returns null for collinear source points', () => {
    const line: Quad<Point2> = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    expect(solveHomography(line, square)).toBeNull();
  });
});

describe('toMatrix3d', () => {
  it('writes the 3×3 into a 4×4 in CSS column-major order', () => {
    const values = parseMatrix(toMatrix3d([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(values).toEqual([1, 4, 0, 7, 2, 5, 0, 8, 0, 0, 1, 0, 3, 6, 0, 9]);
  });
});

describe('viewingStats', () => {
  it('reports distance and angle from the screen normal', () => {
    const head = viewingStats(vec3(0, 0, 500), vec3(0, 0, 0));
    expect(head.distanceMm).toBeCloseTo(500, 9);
    expect(head.angleDeg).toBeCloseTo(0, 9);
    const oblique = viewingStats(vec3(300, 0, 300), vec3(0, 0, 0));
    expect(oblique.angleDeg).toBeCloseTo(45, 9);
    expect(oblique.distanceMm).toBeCloseTo(Math.hypot(300, 300), 9);
  });
});

describe('apparentScale', () => {
  it('is distance over the reference distance, clamped', () => {
    expect(apparentScale(500, 500)).toBe(1);
    expect(apparentScale(1000, 500)).toBe(2);
    expect(apparentScale(100, 500)).toBe(MIN_APPARENT_SCALE);
    expect(apparentScale(5000, 500)).toBe(MAX_APPARENT_SCALE);
  });
});

describe('constant apparent size', () => {
  const ref = { referenceDistanceMm: 500 };
  const halfAngle = (eye: Vec3) => {
    // Frontal view: the projected quad lies in the screen plane, so its half-width
    // subtends atan(halfWidthMm / distance) at the eye.
    const quad = projectedQuad(eye, centred, frame, ref)!;
    const halfWidthMm = ((quad[1].x - quad[0].x) * frame.mmPerPx) / 2;
    return Math.atan(halfWidthMm / eye.z);
  };

  it('is the identity at the reference distance', () => {
    expectAllClose(parseMatrix(computeCorrection(vec3(0, 0, 500), centred, frame, ref)), IDENTITY);
  });

  it('doubles the on-screen size at twice the reference distance, about the element centre', () => {
    const quad = projectedQuad(vec3(0, 0, 1000), centred, frame, ref)!;
    expect(quad[1].x - quad[0].x).toBeCloseTo(2 * centred.width, 9);
    expect(quad[3].y - quad[0].y).toBeCloseTo(2 * centred.height, 9);
    expect((quad[0].x + quad[1].x) / 2).toBeCloseTo(centred.width / 2, 9);
    expect((quad[0].y + quad[3].y) / 2).toBeCloseTo(centred.height / 2, 9);
  });

  it('subtends the same angle at the eye from different distances', () => {
    expect(halfAngle(vec3(0, 0, 400))).toBeCloseTo(halfAngle(vec3(0, 0, 900)), 12);
  });

  it('keeps the physical size when no reference distance is given', () => {
    const quad = projectedQuad(vec3(0, 0, 1000), centred, frame)!;
    expect(quad[1].x - quad[0].x).toBeCloseTo(centred.width, 9);
  });
});
