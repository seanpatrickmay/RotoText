import { describe, expect, it } from 'vitest';
import { cameraConstraints } from '../../src/tracking/camera';

describe('cameraConstraints', () => {
  it('asks a non-touch device (Mac) for 1280x720 to keep the wide field of view', () => {
    expect(cameraConstraints(false)).toEqual({
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    });
  });

  it('keeps 640x480 on a touch device (iPhone)', () => {
    expect(cameraConstraints(true)).toEqual({
      facingMode: 'user',
      width: { ideal: 640 },
      height: { ideal: 480 },
    });
  });
});
