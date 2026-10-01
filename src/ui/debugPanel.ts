import { DEVICE_PRESETS, findPreset } from '../geometry/devices';
import { settingsFromPreset, type Settings } from '../settings';

type NumericKey =
  | 'screenWidthMm'
  | 'screenHeightMm'
  | 'cameraOffsetYMm'
  | 'cameraHfovDeg'
  | 'irisDiameterMm'
  | 'minCutoff'
  | 'beta'
  | 'depthMinCutoff'
  | 'referenceDistanceMm';

interface SliderSpec {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

const SLIDERS: readonly SliderSpec[] = [
  { key: 'screenWidthMm', label: 'Screen width', min: 50, max: 400, step: 0.5, unit: ' mm' },
  { key: 'screenHeightMm', label: 'Screen height', min: 50, max: 300, step: 0.5, unit: ' mm' },
  { key: 'cameraOffsetYMm', label: 'Camera above centre', min: 0, max: 200, step: 0.5, unit: ' mm' },
  { key: 'cameraHfovDeg', label: 'Camera HFOV', min: 30, max: 120, step: 0.5, unit: '°' },
  { key: 'irisDiameterMm', label: 'Iris diameter', min: 9, max: 14, step: 0.1, unit: ' mm' },
  { key: 'minCutoff', label: 'Smoothing min cutoff', min: 0.05, max: 5, step: 0.05, unit: ' Hz' },
  { key: 'beta', label: 'Smoothing beta', min: 0, max: 0.1, step: 0.001, unit: '' },
  { key: 'depthMinCutoff', label: 'Depth smoothing min cutoff', min: 0.05, max: 3, step: 0.05, unit: ' Hz' },
  { key: 'referenceDistanceMm', label: 'Size reference distance', min: 200, max: 1000, step: 10, unit: ' mm' },
];

export interface DebugPanel {
  set(s: Settings): void;
}

function withValue(s: Settings, key: NumericKey, value: number): Settings {
  const next = { ...s };
  next[key] = value;
  return next;
}

function range(min: number, max: number, step: number): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  return input;
}

export function createDebugPanel(root: HTMLElement, initial: Settings, onChange: (s: Settings) => void): DebugPanel {
  let current = initial;

  const select = document.createElement('select');
  for (const p of DEVICE_PRESETS) {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.label;
    select.append(option);
  }
  const presetLabel = document.createElement('label');
  presetLabel.append('Device', select);

  const sliders = SLIDERS.map((spec) => {
    const label = document.createElement('label');
    const value = document.createElement('span');
    const input = range(spec.min, spec.max, spec.step);
    label.append(`${spec.label}: `, value, input);
    input.addEventListener('input', () => update(withValue(current, spec.key, Number(input.value))));
    return { spec, input, value, label };
  });

  const topLabel = document.createElement('label');
  const topValue = document.createElement('span');
  const topAuto = document.createElement('input');
  topAuto.type = 'checkbox';
  const topRange = range(0, 200, 1);
  topLabel.append('Viewport top offset: ', topValue, ' auto ', topAuto, topRange);
  topAuto.addEventListener('change', () =>
    update({ ...current, viewportTopOffsetPx: topAuto.checked ? null : Number(topRange.value) }),
  );
  topRange.addEventListener('input', () => update({ ...current, viewportTopOffsetPx: Number(topRange.value) }));

  const json = document.createElement('pre');
  root.replaceChildren(presetLabel, ...sliders.map((s) => s.label), topLabel, json);

  select.addEventListener('change', () => {
    const preset = findPreset(select.value);
    if (preset) update(settingsFromPreset(preset));
  });

  function sync(): void {
    select.value = current.presetId;
    for (const { spec, input, value } of sliders) {
      input.value = String(current[spec.key]);
      value.textContent = `${current[spec.key]}${spec.unit}`;
    }
    const top = current.viewportTopOffsetPx;
    topAuto.checked = top === null;
    topRange.disabled = top === null;
    if (top !== null) topRange.value = String(top);
    topValue.textContent = top === null ? 'auto' : `${top} px`;
    json.textContent = JSON.stringify(current, null, 2);
  }

  function update(next: Settings): void {
    current = next;
    sync();
    onChange(next);
  }

  sync();
  return {
    set(s) {
      current = s;
      sync();
    },
  };
}
