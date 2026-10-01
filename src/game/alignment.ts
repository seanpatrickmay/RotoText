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
