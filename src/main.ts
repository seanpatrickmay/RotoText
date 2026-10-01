import './styles.css';
import { guessPreset } from './geometry/devices';
import { computeCorrection } from './geometry/projection';
import type { Vec3 } from './geometry/vec3';
import { buildScreenFrame, settingsFromPreset } from './settings';
import { getDemoElements, measureLayout, readViewportEnv, setCorrectionState } from './ui/demo';
import { attachMouseMode } from './ui/mouseMode';

const els = getDemoElements();
const settings = settingsFromPreset(guessPreset(readViewportEnv()));
let frame = buildScreenFrame(settings, readViewportEnv());
let layout = measureLayout(els.correctedBox);
let correctionOn = true;
let lastEye: Vec3 | null = null;
let lastTransform = 'none';

function render(eye: Vec3): void {
  lastEye = eye;
  if (!correctionOn) {
    els.corrected.style.transform = 'none';
    return;
  }
  // A null result means a degenerate pose: keep the last good transform.
  const t = computeCorrection(eye, layout, frame);
  if (t) lastTransform = t;
  els.corrected.style.transform = lastTransform;
}

function remeasure(): void {
  frame = buildScreenFrame(settings, readViewportEnv());
  layout = measureLayout(els.correctedBox);
  mouse.refresh();
}

function toggleCorrection(): void {
  correctionOn = !correctionOn;
  setCorrectionState(els, correctionOn);
  if (lastEye) render(lastEye);
}

const mouse = attachMouseMode(() => frame, render);

window.addEventListener('resize', remeasure);
document.addEventListener('fullscreenchange', remeasure);
// Browsers fire no event when a window is dragged, so poll its position.
let windowPos = `${window.screenX},${window.screenY}`;
setInterval(() => {
  const pos = `${window.screenX},${window.screenY}`;
  if (pos !== windowPos) {
    windowPos = pos;
    remeasure();
  }
}, 500);
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  if (e.target instanceof Element && e.target.closest('input, select, textarea, button, summary')) return;
  e.preventDefault();
  toggleCorrection();
});
els.correctedBox.addEventListener('click', toggleCorrection);
