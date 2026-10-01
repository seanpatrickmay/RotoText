export interface DevicePreset {
  id: string;
  label: string;
  kind: 'mac' | 'iphone';
  /** Visible display area. iPhone values are portrait. */
  screenWidthMm: number;
  screenHeightMm: number;
  /** Camera lens position in screen space (mm, origin at screen centre, +y up). */
  cameraOffsetMm: { x: number; y: number };
  /** Horizontal FOV of the camera stream as delivered (portrait on iPhone). */
  cameraHfovDeg: number;
  /** Default `screen.width`; only used to auto-guess the device. */
  nominalCssWidthPx: number;
}

export interface GuessEnv {
  screenWidthPx: number;
  screenHeightPx: number;
  isTouch: boolean;
}

const MAC_LENS_BELOW_TOP_MM = 3;
const IPHONE_LENS_BELOW_TOP_MM = 5;
const DEFAULT_HFOV_DEG = 70;

export const DEVICE_PRESETS: readonly DevicePreset[] = [
  {
    id: 'mba-13',
    label: 'MacBook Air 13"',
    kind: 'mac',
    screenWidthMm: 290.3,
    screenHeightMm: 188.7,
    cameraOffsetMm: { x: 0, y: 188.7 / 2 - MAC_LENS_BELOW_TOP_MM },
    cameraHfovDeg: DEFAULT_HFOV_DEG,
    nominalCssWidthPx: 1470,
  },
  {
    id: 'mbp-14',
    label: 'MacBook Pro 14"',
    kind: 'mac',
    screenWidthMm: 302.4,
    screenHeightMm: 196.4,
    cameraOffsetMm: { x: 0, y: 196.4 / 2 - MAC_LENS_BELOW_TOP_MM },
    cameraHfovDeg: DEFAULT_HFOV_DEG,
    nominalCssWidthPx: 1512,
  },
  {
    id: 'mbp-16',
    label: 'MacBook Pro 16"',
    kind: 'mac',
    screenWidthMm: 345.6,
    screenHeightMm: 223.4,
    cameraOffsetMm: { x: 0, y: 223.4 / 2 - MAC_LENS_BELOW_TOP_MM },
    cameraHfovDeg: DEFAULT_HFOV_DEG,
    nominalCssWidthPx: 1728,
  },
  {
    id: 'iphone-6.1',
    label: 'iPhone 6.1" (15 / 16)',
    kind: 'iphone',
    screenWidthMm: 65.1,
    screenHeightMm: 141.1,
    cameraOffsetMm: { x: 0, y: 141.1 / 2 - IPHONE_LENS_BELOW_TOP_MM },
    cameraHfovDeg: DEFAULT_HFOV_DEG,
    nominalCssWidthPx: 393,
  },
  {
    id: 'iphone-6.7',
    label: 'iPhone 6.7" (Plus / Pro Max)',
    kind: 'iphone',
    screenWidthMm: 71.2,
    screenHeightMm: 154.4,
    cameraOffsetMm: { x: 0, y: 154.4 / 2 - IPHONE_LENS_BELOW_TOP_MM },
    cameraHfovDeg: DEFAULT_HFOV_DEG,
    nominalCssWidthPx: 430,
  },
];

export function guessPreset(env: GuessEnv): DevicePreset {
  const kind = env.isTouch && env.screenHeightPx > env.screenWidthPx ? 'iphone' : 'mac';
  const candidates = DEVICE_PRESETS.filter((p) => p.kind === kind);
  const gap = (p: DevicePreset) => Math.abs(p.nominalCssWidthPx - env.screenWidthPx);
  return candidates.reduce((best, p) => (gap(p) < gap(best) ? p : best));
}

export function findPreset(id: string): DevicePreset | undefined {
  return DEVICE_PRESETS.find((p) => p.id === id);
}
