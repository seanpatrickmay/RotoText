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
