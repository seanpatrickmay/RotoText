import { vec3, type Vec3 } from '../geometry/vec3';

export interface OneEuroParams {
  /** Hz. Lower = less jitter when still, more lag. */
  minCutoff: number;
  /** Speed coefficient. Higher = less lag when moving fast. */
  beta: number;
  /** Hz. Cutoff for the derivative estimate. */
  dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1.0, beta: 0.01, dCutoff: 1.0 };
/**
 * For the iris diameter in px, which sets depth. A ~21 px iris jitters by about half a
 * pixel, which is ~12 mm of depth at 50 cm — so depth is smoothed far harder than x/y.
 */
export const DEFAULT_DEPTH_ONE_EURO: OneEuroParams = { minCutoff: 0.3, beta: 0.05, dCutoff: 1.0 };

function alpha(cutoffHz: number, dtS: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtS);
}

class OneEuroScalar {
  private x: number | null = null;
  private dx = 0;

  filter(value: number, dtS: number, p: OneEuroParams): number {
    if (this.x === null) {
      this.x = value;
      return value;
    }
    const rawDx = (value - this.x) / dtS;
    this.dx += alpha(p.dCutoff, dtS) * (rawDx - this.dx);
    const cutoff = p.minCutoff + p.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dtS) * (value - this.x);
    return this.x;
  }

  reset(): void {
    this.x = null;
    this.dx = 0;
  }
}

/** One-euro filter on a single timestamped value. */
export class OneEuroFilter1 {
  private readonly scalar = new OneEuroScalar();
  private lastMs: number | null = null;
  private lastOut: number | null = null;

  constructor(private params: OneEuroParams) {}

  setParams(params: OneEuroParams): void {
    this.params = params;
  }

  reset(): void {
    this.scalar.reset();
    this.lastMs = null;
    this.lastOut = null;
  }

  filter(value: number, tMs: number): number {
    if (!Number.isFinite(value)) return this.lastOut ?? value;
    if (this.lastOut !== null && this.lastMs !== null && !(tMs > this.lastMs)) return this.lastOut;
    const dtS = this.lastMs === null ? 0 : (tMs - this.lastMs) / 1000;
    this.lastMs = tMs;
    this.lastOut = this.scalar.filter(value, dtS, this.params);
    return this.lastOut;
  }
}

/**
 * Exponential approach of `from` toward `goal` over `dtMs` with time constant `tauMs`.
 * Frame-rate independent, so it can run per display frame between camera frames.
 */
export function easeToward(from: Vec3, goal: Vec3, dtMs: number, tauMs: number): Vec3 {
  if (!(dtMs > 0)) return from;
  if (!(tauMs > 0)) return goal;
  const k = 1 - Math.exp(-dtMs / tauMs);
  return vec3(from.x + (goal.x - from.x) * k, from.y + (goal.y - from.y) * k, from.z + (goal.z - from.z) * k);
}

/** One-euro filter (Casiez et al. 2012) applied per axis. */
export class OneEuroFilter3 {
  private readonly axes = [new OneEuroScalar(), new OneEuroScalar(), new OneEuroScalar()] as const;
  private lastMs: number | null = null;
  private lastOut: Vec3 | null = null;

  constructor(private params: OneEuroParams) {}

  setParams(params: OneEuroParams): void {
    this.params = params;
  }

  reset(): void {
    this.axes.forEach((a) => a.reset());
    this.lastMs = null;
    this.lastOut = null;
  }

  filter(p: Vec3, tMs: number): Vec3 {
    const finite = Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
    if (!finite) return this.lastOut ?? p;
    if (this.lastOut !== null && this.lastMs !== null && !(tMs > this.lastMs)) return this.lastOut;

    const dtS = this.lastMs === null ? 0 : (tMs - this.lastMs) / 1000;
    this.lastMs = tMs;
    const [ax, ay, az] = this.axes;
    this.lastOut = vec3(ax.filter(p.x, dtS, this.params), ay.filter(p.y, dtS, this.params), az.filter(p.z, dtS, this.params));
    return this.lastOut;
  }
}
