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
