import { describe, expect, it } from 'vitest';
import { calibrationKey, createCalibrationStore } from '../src/calibrationStore';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const throwing = (): Storage => {
  const boom = () => {
    throw new Error('SecurityError');
  };
  return { getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 } as unknown as Storage;
};

describe('createCalibrationStore', () => {
  it('round-trips per preset', () => {
    const storage = memoryStorage();
    const store = createCalibrationStore(() => storage);
    expect(store.load('mbp-16')).toBeNull();
    store.save('mbp-16', 63.5);
    store.save('mba-13', 71);
    expect(store.load('mbp-16')).toBe(63.5);
    expect(store.load('mba-13')).toBe(71);
    expect(storage.getItem(calibrationKey('mbp-16'))).toBe('63.5');
    store.clear('mbp-16');
    expect(store.load('mbp-16')).toBeNull();
    expect(store.load('mba-13')).toBe(71);
  });

  it('ignores garbage and out-of-range saved values', () => {
    const storage = memoryStorage();
    const store = createCalibrationStore(() => storage);
    for (const bad of ['abc', 'NaN', '', '999', '10']) {
      storage.setItem(calibrationKey('mbp-16'), bad);
      expect(store.load('mbp-16')).toBeNull();
    }
  });

  it('behaves as empty when storage throws, is missing, or cannot be reached', () => {
    for (const store of [
      createCalibrationStore(throwing),
      createCalibrationStore(() => undefined),
      createCalibrationStore(() => {
        throw new Error('blocked');
      }),
    ]) {
      expect(() => store.save('mbp-16', 63.5)).not.toThrow();
      expect(store.load('mbp-16')).toBeNull();
      expect(() => store.clear('mbp-16')).not.toThrow();
    }
  });
});
