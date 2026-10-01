import { MAX_HFOV_DEG, MIN_HFOV_DEG } from './tracking/calibration';

export interface CalibrationStore {
  load(presetId: string): number | null;
  save(presetId: string, hfovDeg: number): void;
  clear(presetId: string): void;
}

export const calibrationKey = (presetId: string) => `rototext.hfov.${presetId}`;

/**
 * Per-preset calibrated HFOV. Storage can be missing or throw (private windows,
 * blocked site data); then the store behaves as empty and calibration only lasts
 * for the session.
 */
export function createCalibrationStore(getStorage: () => Storage | undefined): CalibrationStore {
  const storage = (): Storage | undefined => {
    try {
      return getStorage();
    } catch {
      return undefined;
    }
  };
  return {
    load(presetId) {
      try {
        const raw = storage()?.getItem(calibrationKey(presetId));
        if (raw == null || raw === '') return null;
        const value = Number(raw);
        return Number.isFinite(value) && value >= MIN_HFOV_DEG && value <= MAX_HFOV_DEG ? value : null;
      } catch {
        return null;
      }
    },
    save(presetId, hfovDeg) {
      try {
        storage()?.setItem(calibrationKey(presetId), String(hfovDeg));
      } catch {
        // Storage unavailable: the value still applies for this session.
      }
    },
    clear(presetId) {
      try {
        storage()?.removeItem(calibrationKey(presetId));
      } catch {
        // Nothing to clear.
      }
    },
  };
}
