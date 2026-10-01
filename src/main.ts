import './styles.css';
import { findPreset, guessPreset } from './geometry/devices';
import { computeCorrection, viewingStats } from './geometry/projection';
import { cameraToScreen, layoutToScreenRect } from './geometry/screenSpace';
import { add, vec3, type Vec3 } from './geometry/vec3';
import { buildScreenFrame, cameraOffset, settingsFromPreset, type Settings } from './settings';
import { CameraError, openCamera, stopCamera } from './tracking/camera';
import { estimateEye, irisMidpoint, type Landmark2D } from './tracking/eyeEstimator';
import { createFaceTracker, type FaceTracker } from './tracking/faceTracker';
import { OneEuroFilter3 } from './tracking/smoothing';
import { initialTargetState, updateTarget, type TargetStatus } from './tracking/targetController';
import { createDebugPanel } from './ui/debugPanel';
import { getDemoElements, hideBanner, measureLayout, readViewportEnv, setFollowState, showBanner } from './ui/demo';
import { createInset, type Mode } from './ui/inset';
import { attachMouseMode, type MouseModeHandle } from './ui/mouseMode';

const els = getDemoElements();
const inset = createInset(els.inset);
let settings = settingsFromPreset(guessPreset(readViewportEnv()));
let frame = buildScreenFrame(settings, readViewportEnv());
let layout = measureLayout(els.correctedBox);
const smoother = new OneEuroFilter3({ minCutoff: settings.minCutoff, beta: settings.beta, dCutoff: 1 });

/** Following: warp toward the viewer's eye. Static: plain, untransformed text. */
let following = true;
let lastTransform = 'none';
let lastEye: Vec3 | null = null;

let mode: Mode = 'mouse';
let status: TargetStatus | null = null;
let eyePoint: Landmark2D | null = null;
let fps: number | null = null;
let lastFrameMs: number | null = null;
let tracker: FaceTracker | null = null;
let stream: MediaStream | null = null;
let mouse: MouseModeHandle | null = null;
let targetState = initialTargetState();
/** Bumped on every camera start so a stale frame callback can tell it is stale. */
let loopId = 0;
/** True while a camera start is pending (permission prompt, model load). */
let starting = false;

const headlineCenter = () => layoutToScreenRect(layout, frame).center;
// Resting at the size reference distance gives the identity transform.
const restingEye = () => add(headlineCenter(), vec3(0, 0, settings.referenceDistanceMm));

function render(eye: Vec3): void {
  lastEye = eye;
  if (following) {
    // A null result means a degenerate pose: keep the last good transform.
    const t = computeCorrection(eye, layout, frame, { referenceDistanceMm: settings.referenceDistanceMm });
    if (t) lastTransform = t;
    els.corrected.style.transform = lastTransform;
  } else {
    els.corrected.style.transform = 'none';
  }
  const stats = viewingStats(eye, headlineCenter());
  inset.update({
    mode,
    status,
    distanceMm: stats.distanceMm,
    angleDeg: stats.angleDeg,
    fps,
    delegate: tracker?.delegate ?? null,
    presetLabel: findPreset(settings.presetId)?.label ?? settings.presetId,
    eyePoint,
  });
}

function onVideoFrame(nowMs: number, id: number): void {
  if (id !== loopId || mode !== 'camera' || !tracker) return;
  if (lastFrameMs !== null && nowMs > lastFrameMs) {
    const instant = 1000 / (nowMs - lastFrameMs);
    fps = fps === null ? instant : fps * 0.9 + instant * 0.1;
  }
  lastFrameMs = nowMs;

  const video = inset.video;
  let face: ReturnType<FaceTracker['detect']>;
  try {
    face = tracker.detect(video, nowMs);
  } catch (err) {
    handleDetectError(err, id);
    return;
  }
  const eyeCam = face
    ? estimateEye(face, {
        frameWidthPx: video.videoWidth,
        frameHeightPx: video.videoHeight,
        hfovDeg: settings.cameraHfovDeg,
        irisDiameterMm: settings.irisDiameterMm,
      })
    : null;
  eyePoint = face ? irisMidpoint(face) : null;
  const measured = eyeCam ? cameraToScreen(eyeCam, cameraOffset(settings)) : null;

  const step = updateTarget(targetState, measured, nowMs, restingEye());
  targetState = step.state;
  status = step.status;
  render(smoother.filter(step.target, nowMs));
  scheduleFrame(id);
}

function scheduleFrame(id: number): void {
  const video = inset.video;
  if (typeof video.requestVideoFrameCallback === 'function') {
    video.requestVideoFrameCallback((now) => onVideoFrame(now, id));
  } else {
    requestAnimationFrame((now) => onVideoFrame(now, id));
  }
}

function describeError(err: unknown): string {
  if (err instanceof CameraError) return `${err.message} Using mouse mode instead.`;
  const detail = err instanceof Error ? err.message : String(err);
  return `Face tracking failed to load (${detail}). Using mouse mode instead.`;
}

/**
 * A throwing detect() must not silently kill the frame loop. A GPU failure
 * rebuilds the tracker on the CPU delegate (no frames are scheduled meanwhile);
 * anything else falls back to mouse mode with a banner.
 */
function handleDetectError(err: unknown, id: number): void {
  console.error(err);
  const failed = tracker;
  if (failed && failed.delegate === 'GPU') {
    failed.close();
    tracker = null;
    createFaceTracker('CPU').then(
      (cpu) => {
        if (tracker) {
          cpu.close();
        } else {
          tracker = cpu;
        }
        if (id === loopId && mode === 'camera') scheduleFrame(id);
      },
      (err2: unknown) => {
        console.error(err2);
        if (id !== loopId || mode !== 'camera') return;
        showBanner(els, describeError(err2));
        enterMouseMode();
      },
    );
    return;
  }
  showBanner(els, describeError(err));
  enterMouseMode();
}

function enterMouseMode(): void {
  mode = 'mouse';
  status = null;
  eyePoint = null;
  fps = null;
  loopId++;
  if (stream) {
    stopCamera(stream);
    stream = null;
  }
  mouse ??= attachMouseMode(() => frame, render);
}

async function enterCameraMode(): Promise<void> {
  if (starting) return;
  starting = true;
  inset.setModeButtonBusy(true);
  try {
    hideBanner(els);
    // rVFC may never fire for a display:none video, so unhide the feed first.
    inset.showFeed(true);
    stream = await openCamera(inset.video);
    tracker ??= await createFaceTracker();
    mouse?.detach();
    mouse = null;
    mode = 'camera';
    smoother.reset();
    targetState = initialTargetState();
    lastFrameMs = null;
    fps = null;
    render(lastEye ?? restingEye());
    scheduleFrame(++loopId);
  } catch (err) {
    console.error(err);
    showBanner(els, describeError(err));
    inset.showFeed(false);
    enterMouseMode();
  } finally {
    starting = false;
    inset.setModeButtonBusy(false);
  }
}

function remeasure(): void {
  frame = buildScreenFrame(settings, readViewportEnv());
  layout = measureLayout(els.correctedBox);
  if (mode === 'mouse' && mouse) mouse.refresh();
  else if (lastEye) render(lastEye);
}

function toggleFollowing(): void {
  following = !following;
  setFollowState(els, following);
  if (lastEye) render(lastEye);
}

function applySettings(next: Settings): void {
  settings = next;
  smoother.setParams({ minCutoff: next.minCutoff, beta: next.beta, dCutoff: 1 });
  remeasure();
}

createDebugPanel(els.debugBody, settings, applySettings);

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
  toggleFollowing();
});
els.correctedBox.addEventListener('click', toggleFollowing);
els.followToggle.addEventListener('click', toggleFollowing);
// A mouse click must not focus the Tune <summary>, or Space would toggle the panel.
document.querySelector('#debug > summary')?.addEventListener('mousedown', (e) => e.preventDefault());
inset.onModeButton(() => {
  if (mode === 'camera') enterMouseMode();
  else void enterCameraMode();
});
inset.onFullscreenButton(() => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
});

render(restingEye());
void enterCameraMode();
