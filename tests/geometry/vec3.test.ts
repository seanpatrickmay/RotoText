import { describe, expect, it } from 'vitest';
import { add, cross, dot, length, lerp, normalize, scale, sub, vec3 } from '../../src/geometry/vec3';

describe('vec3', () => {
  it('adds, subtracts and scales', () => {
    expect(add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual(vec3(5, 7, 9));
    expect(sub(vec3(4, 5, 6), vec3(1, 2, 3))).toEqual(vec3(3, 3, 3));
    expect(scale(vec3(1, -2, 3), 2)).toEqual(vec3(2, -4, 6));
  });

  it('computes dot and right-handed cross products', () => {
    expect(dot(vec3(1, 2, 3), vec3(4, 5, 6))).toBe(32);
    expect(cross(vec3(0, 1, 0), vec3(0, 0, 1))).toEqual(vec3(1, 0, 0));
    expect(cross(vec3(0, 0, 1), vec3(1, 0, 0))).toEqual(vec3(0, 1, 0));
  });

  it('normalizes to unit length and leaves the zero vector alone', () => {
    const n = normalize(vec3(3, 0, 4));
    expect(length(n)).toBeCloseTo(1, 12);
    expect(n.x).toBeCloseTo(0.6, 12);
    expect(n.z).toBeCloseTo(0.8, 12);
    expect(normalize(vec3(0, 0, 0))).toEqual(vec3(0, 0, 0));
  });

  it('lerps between points', () => {
    expect(lerp(vec3(0, 0, 0), vec3(10, 20, 30), 0.5)).toEqual(vec3(5, 10, 15));
    expect(lerp(vec3(1, 1, 1), vec3(9, 9, 9), 0)).toEqual(vec3(1, 1, 1));
  });
});
