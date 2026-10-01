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
