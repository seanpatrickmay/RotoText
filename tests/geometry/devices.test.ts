import { describe, expect, it } from 'vitest';
import { DEVICE_PRESETS, findPreset, guessPreset } from '../../src/geometry/devices';

describe('DEVICE_PRESETS', () => {
  it('every preset has sane geometry', () => {
    for (const p of DEVICE_PRESETS) {
      expect(p.screenWidthMm).toBeGreaterThan(0);
      expect(p.screenHeightMm).toBeGreaterThan(0);
      expect(p.cameraHfovDeg).toBeGreaterThan(30);
      expect(p.cameraHfovDeg).toBeLessThan(120);
      expect(p.cameraOffsetMm.x).toBe(0);
      expect(p.cameraOffsetMm.y).toBeGreaterThan(0);
      expect(p.cameraOffsetMm.y).toBeLessThanOrEqual(p.screenHeightMm / 2 + 15);
      expect(p.nominalCssWidthPx).toBeGreaterThan(0);
    }
  });

  it('has unique ids', () => {
    const ids = DEVICE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('iPhone presets are portrait (taller than wide)', () => {
    for (const p of DEVICE_PRESETS.filter((d) => d.kind === 'iphone')) {
      expect(p.screenHeightMm).toBeGreaterThan(p.screenWidthMm);
    }
  });
});

describe('guessPreset', () => {
  it('picks the 6.1" iPhone for a 393px portrait touch screen', () => {
    expect(guessPreset({ screenWidthPx: 393, screenHeightPx: 852, isTouch: true }).id).toBe('iphone-6.1');
  });

  it('picks the 6.7" iPhone for a 430px portrait touch screen', () => {
    expect(guessPreset({ screenWidthPx: 430, screenHeightPx: 932, isTouch: true }).id).toBe('iphone-6.7');
  });

  it('picks MacBooks by their default scaled width', () => {
    expect(guessPreset({ screenWidthPx: 1512, screenHeightPx: 982, isTouch: false }).id).toBe('mbp-14');
    expect(guessPreset({ screenWidthPx: 1470, screenHeightPx: 956, isTouch: false }).id).toBe('mba-13');
    expect(guessPreset({ screenWidthPx: 1728, screenHeightPx: 1117, isTouch: false }).id).toBe('mbp-16');
  });

  it('falls back to the closest MacBook for an unknown non-touch screen', () => {
    expect(guessPreset({ screenWidthPx: 1920, screenHeightPx: 1080, isTouch: false }).kind).toBe('mac');
  });
});

describe('findPreset', () => {
  it('finds by id and returns undefined for unknown ids', () => {
    expect(findPreset('mbp-14')?.label).toContain('14');
    expect(findPreset('nope')).toBeUndefined();
  });
});
