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
  { name: 'Star', outline: STAR, offset: { x: -150, y: 20 }, depthMin: 30, depthMax: 200, seed: 4 },
  { name: 'Linked rings', outline: LINKED_RINGS, offset: { x: 120, y: 80 }, depthMin: 30, depthMax: 220, seed: 5 },
  { name: 'Key', outline: KEY, offset: { x: 180, y: 0 }, depthMin: 30, depthMax: 240, seed: 6 },
  { name: 'ROTO', outline: ROTO, offset: { x: -150, y: 100 }, depthMin: 30, depthMax: 240, seed: 7 },
];
