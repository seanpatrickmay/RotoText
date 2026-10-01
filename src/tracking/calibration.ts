import { DEFAULT_IRIS_DIAMETER_MM } from '../settings';

export const CALIBRATION_DISTANCE_MM = 500;
export const MIN_CALIBRATION_SAMPLES = 15;
export const MAX_CALIBRATION_MS = 3000;
export const MIN_HFOV_DEG = 30;
export const MAX_HFOV_DEG = 120;

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The camera's horizontal field of view implied by the iris sizes seen while the
 * viewer sits at `distanceMm`. Null when there are too few valid samples or the
 * result is implausible.
 */
export function hfovFromIris(
  irisPxSamples: readonly number[],
  frameWidthPx: number,
  irisDiameterMm: number = DEFAULT_IRIS_DIAMETER_MM,
  distanceMm: number = CALIBRATION_DISTANCE_MM,
): number | null {
  const valid = irisPxSamples.filter((v) => Number.isFinite(v) && v > 0);
  if (valid.length < MIN_CALIBRATION_SAMPLES) return null;
  const focalPx = (distanceMm * median(valid)) / irisDiameterMm;
  const hfov = (2 * Math.atan(frameWidthPx / 2 / focalPx) * 180) / Math.PI;
  return Number.isFinite(hfov) && hfov >= MIN_HFOV_DEG && hfov <= MAX_HFOV_DEG ? hfov : null;
}
