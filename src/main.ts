import './styles.css';
import { misalignmentPx } from './game/alignment';
import { LEVELS } from './game/levels';
import { buildLevel } from './game/pieces';
import { gameView, initialSession, resetHold, skipLevel, stepSession, type GameView, type Session } from './game/session';
import { createGameRenderer } from './scene/gameRenderer';
import { createGameHud, type GameHudState } from './ui/gameHud';
import { createCalibrationStore } from './calibrationStore';
import { findPreset, guessPreset } from './geometry/devices';
import { computeCorrection, viewingStats } from './geometry/projection';
import { cameraToScreen, layoutToScreenRect } from './geometry/screenSpace';
import { add, vec3, type Vec3 } from './geometry/vec3';
import { buildScreenFrame, cameraOffset, settingsFromPreset, type Settings } from './settings';
import { createSvgRenderer } from './scene/svgRenderer';
import { buildBoxGrid, buildTargetsScene, rectCenter, viewportRectMm } from './scene/targets';
import { CALIBRATION_DISTANCE_MM, hfovFromIris, MAX_CALIBRATION_MS, MIN_CALIBRATION_SAMPLES } from './tracking/calibration';
import { CameraError, openCamera, stopCamera } from './tracking/camera';
import { eyeFromIris, irisMidpoint, largerIrisDiameterPx, type Landmark2D } from './tracking/eyeEstimator';
import { createFaceTracker, type FaceTracker } from './tracking/faceTracker';
import { DEFAULT_DEPTH_ONE_EURO, easeToward, OneEuroFilter1, OneEuroFilter3 } from './tracking/smoothing';
import { initialTargetState, updateTarget, type TargetStatus } from './tracking/targetController';
import { createCalibrateDialog } from './ui/calibrateDialog';
import { createDebugPanel } from './ui/debugPanel';
import { getDemoElements, hideBanner, measureLayout, readViewportEnv, setFollowState, showBanner } from './ui/demo';
import { createInset, type Mode } from './ui/inset';
import { attachMouseMode, type MouseModeHandle } from './ui/mouseMode';
import { createSceneSwitch, type SceneName } from './ui/sceneSwitch';

const els = getDemoElements();
const inset = createInset(els.inset);
const calibrationStore = createCalibrationStore(() => window.localStorage);
/** A saved calibration for this preset overrides the preset's HFOV. */
function withSavedCalibration(s: Settings): Settings {
  const saved = calibrationStore.load(s.presetId);
  return saved === null ? s : { ...s, cameraHfovDeg: saved };
}
let settings = withSavedCalibration(settingsFromPreset(guessPreset(readViewportEnv())));
/** Iris sizes collected during a calibration run; null when not calibrating. */
let calibration: { samples: number[]; frameWidthPx: number; startedMs: number; presetId: string } | null = null;
let calibrationTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let frame = buildScreenFrame(settings, readViewportEnv());
let layout = measureLayout(els.correctedBox);
let scene: SceneName = 'targets';
document.body.dataset.scene = scene;
let sceneRect = viewportRectMm(frame, window.innerWidth, window.innerHeight);
const renderer = createSvgRenderer(els.scene);
/** Targets shows the full scene; Line of Sight uses the box grid alone as a backdrop. */
const backdrop = () => (scene === 'game' ? buildBoxGrid(sceneRect) : buildTargetsScene(sceneRect));
renderer.setScene(backdrop());

let session: Session = initialSession();
let level = buildLevel(LEVELS[session.levelIndex]!, sceneRect);
const gameRenderer = createGameRenderer(els.game);
gameRenderer.setLevel(level);
const hud = createGameHud(els.gameHud);
/** Bumped on every entry to the game scene so a stale loop stops itself. */
let gameLoopId = 0;
let lastGameMs: number | null = null;
const smoother = new OneEuroFilter3({ minCutoff: settings.minCutoff, beta: settings.beta, dCutoff: 1 });
/** Smooths the iris size before it becomes depth: the noisiest input by far. */
const irisSmoother = new OneEuroFilter1({ ...DEFAULT_DEPTH_ONE_EURO, minCutoff: settings.depthMinCutoff });
/**
 * The camera delivers ~30 Hz; the display runs at 60–120 Hz. Each display frame eases the
 * shown eye toward the latest tracked one so the scene glides instead of stepping.
 */
const DISPLAY_EASE_MS = 30;
let goalEye: Vec3 | null = null;
let lastDisplayMs: number | null = null;
/** Set by each camera frame so the next display frame re-renders (and refreshes the inset). */
let displayDirty = false;

/**
 * Following: warp toward the viewer's eye. Static: the text scene is plain, untransformed
 * text; the targets scene is rendered from the resting eye (the straight-on view).
 */
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
/** What the viewer is looking at: the headline (text scene) or the box's front face. */
const viewCenter = () => (scene === 'text' ? headlineCenter() : rectCenter(sceneRect));
// Resting at the size reference distance gives the identity transform (text scene)
// and the straight-on view (targets scene).
const restingEye = () => add(viewCenter(), vec3(0, 0, settings.referenceDistanceMm));

function render(eye: Vec3): void {
  lastEye = eye;
  if (scene !== 'text') {
    // The game always follows: a static view could never be solved.
    renderer.render(scene === 'game' || following ? eye : restingEye(), frame);
  } else if (following) {
    // A null result means a degenerate pose: keep the last good transform.
    const t = computeCorrection(eye, layout, frame, { referenceDistanceMm: settings.referenceDistanceMm });
    if (t) lastTransform = t;
    els.corrected.style.transform = lastTransform;
  } else {
    els.corrected.style.transform = 'none';
  }
  const stats = viewingStats(eye, viewCenter());
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
  const irisPx = face ? largerIrisDiameterPx(face, video.videoWidth, video.videoHeight) : 0;
  // Calibration takes the median of raw sizes; only tracking uses the smoothed size.
  const eyeCam = face
    ? eyeFromIris(irisPx > 0 ? irisSmoother.filter(irisPx, nowMs) : irisPx, irisMidpoint(face), {
        frameWidthPx: video.videoWidth,
        frameHeightPx: video.videoHeight,
        hfovDeg: settings.cameraHfovDeg,
        irisDiameterMm: settings.irisDiameterMm,
      })
    : null;
  eyePoint = face ? irisMidpoint(face) : null;
  if (calibration && face) calibration.samples.push(irisPx);
  const measured = eyeCam ? cameraToScreen(eyeCam, cameraOffset(settings)) : null;

  const step = updateTarget(targetState, measured, nowMs, restingEye());
  targetState = step.state;
  status = step.status;
  goalEye = smoother.filter(step.target, nowMs);
  displayDirty = true;
  scheduleFrame(id);
}

function onDisplayFrame(nowMs: number, id: number): void {
  if (id !== loopId || mode !== 'camera') return;
  const dt = lastDisplayMs === null ? 0 : nowMs - lastDisplayMs;
  lastDisplayMs = nowMs;
  if (goalEye && lastEye) {
    const next = easeToward(lastEye, goalEye, dt, DISPLAY_EASE_MS);
    const moved = Math.max(Math.abs(next.x - lastEye.x), Math.abs(next.y - lastEye.y), Math.abs(next.z - lastEye.z));
    if (displayDirty || moved > 0.005) render(next);
    displayDirty = false;
  }
  requestAnimationFrame((now) => onDisplayFrame(now, id));
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
  abortCalibration();
  dialog.close();
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
    irisSmoother.reset();
    targetState = initialTargetState();
    lastFrameMs = null;
    fps = null;
    render(lastEye ?? restingEye());
    goalEye = lastEye;
    lastDisplayMs = null;
    const id = ++loopId;
    scheduleFrame(id);
    requestAnimationFrame((now) => onDisplayFrame(now, id));
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
  sceneRect = viewportRectMm(frame, window.innerWidth, window.innerHeight);
  renderer.setScene(backdrop());
  // The pieces depend on the viewport rect: rebuild, and drop a hold that no longer applies.
  loadLevel();
  session = resetHold(session);
  if (mode === 'mouse' && mouse) mouse.refresh();
  else if (lastEye) render(lastEye);
}

function loadLevel(): void {
  level = buildLevel(LEVELS[session.levelIndex]!, sceneRect);
  gameRenderer.setLevel(level);
}

function hudState(view: GameView): GameHudState {
  return {
    levelIndex: session.levelIndex,
    levelCount: LEVELS.length,
    levelName: LEVELS[session.levelIndex]!.name,
    progress: view.progress,
    done: session.phase === 'done',
  };
}

/**
 * Runs every display frame while Line of Sight is showing — independently of camera frames
 * and mouse events, so a hold completes even with a perfectly still pointer.
 */
function gameTick(nowMs: number, id: number): void {
  if (id !== gameLoopId || scene !== 'game') return;
  const dt = lastGameMs === null ? 0 : nowMs - lastGameMs;
  lastGameMs = nowMs;
  const eye = lastEye ?? restingEye();
  const misalignment = misalignmentPx(eye, level.pieces, frame);
  const before = session.levelIndex;
  session = stepSession(session, misalignment, dt, LEVELS.length);
  if (session.levelIndex !== before) loadLevel();
  const view = gameView(session, misalignment);
  gameRenderer.render(eye, frame, view);
  hud.update(hudState(view));
  requestAnimationFrame((t) => gameTick(t, id));
}

function startGameLoop(): void {
  lastGameMs = null;
  const id = ++gameLoopId;
  requestAnimationFrame((t) => gameTick(t, id));
}

hud.onSkip(() => {
  const before = session.levelIndex;
  session = skipLevel(session, LEVELS.length);
  if (session.levelIndex !== before) loadLevel();
});
hud.onRestart(() => {
  session = initialSession();
  loadLevel();
});

function toggleFollowing(): void {
  following = !following;
  setFollowState(els, following);
  if (lastEye) render(lastEye);
}

function applySettings(next: Settings): void {
  // Switching presets picks up that preset's saved calibration, if any.
  const resolved = next.presetId !== settings.presetId ? withSavedCalibration(next) : next;
  settings = resolved;
  smoother.setParams({ minCutoff: resolved.minCutoff, beta: resolved.beta, dCutoff: 1 });
  irisSmoother.setParams({ ...DEFAULT_DEPTH_ONE_EURO, minCutoff: resolved.depthMinCutoff });
  if (resolved !== next) panel.set(resolved);
  remeasure();
}

const panel = createDebugPanel(els.debugBody, settings, applySettings);

/** Collect for at least this long, then until enough samples arrive or MAX_CALIBRATION_MS passes. */
const CALIBRATION_WINDOW_MS = 1000;
const CALIBRATION_POLL_MS = 100;
const dialog = createCalibrateDialog(document.getElementById('calibrate')!);

/** Drop any pending run and auto-close timer; nothing is saved or applied. */
function abortCalibration(): void {
  if (calibrationTimer !== null) clearTimeout(calibrationTimer);
  if (closeTimer !== null) clearTimeout(closeTimer);
  calibrationTimer = null;
  closeTimer = null;
  calibration = null;
  dialog.setBusy(false);
}

/** Ends the run once the minimum window has passed and it has enough valid samples, or time is up. */
function checkCalibration(): void {
  calibrationTimer = null;
  if (!calibration) return;
  const elapsed = performance.now() - calibration.startedMs;
  const valid = calibration.samples.filter((v) => Number.isFinite(v) && v > 0).length;
  if (valid < MIN_CALIBRATION_SAMPLES && elapsed < MAX_CALIBRATION_MS) {
    calibrationTimer = setTimeout(checkCalibration, Math.min(CALIBRATION_POLL_MS, MAX_CALIBRATION_MS - elapsed));
    return;
  }
  finishCalibration();
}

function finishCalibration(): void {
  calibrationTimer = null;
  const run = calibration;
  calibration = null;
  dialog.setBusy(false);
  if (!run) return;
  if (run.presetId !== settings.presetId) {
    dialog.setStatus('Device changed — try again');
    return;
  }
  const hfov = hfovFromIris(run.samples, run.frameWidthPx, settings.irisDiameterMm, CALIBRATION_DISTANCE_MM);
  if (hfov === null) {
    dialog.setStatus('No steady face found — try again');
    return;
  }
  const rounded = Math.round(hfov * 10) / 10;
  calibrationStore.save(run.presetId, rounded);
  const next = { ...settings, cameraHfovDeg: rounded };
  applySettings(next);
  panel.set(next);
  dialog.setStatus(`Calibrated: HFOV ${rounded.toFixed(1)}°`);
  closeTimer = setTimeout(() => dialog.close(), 1500);
}

dialog.onStart(() => {
  if (mode !== 'camera' || calibration) return;
  if (closeTimer !== null) clearTimeout(closeTimer);
  closeTimer = null;
  calibration = { samples: [], frameWidthPx: inset.video.videoWidth, startedMs: performance.now(), presetId: settings.presetId };
  dialog.setBusy(true);
  dialog.setStatus('Hold still…');
  calibrationTimer = setTimeout(checkCalibration, CALIBRATION_WINDOW_MS);
});

dialog.onCancel(abortCalibration);

dialog.onReset(() => {
  abortCalibration();
  calibrationStore.clear(settings.presetId);
  const preset = findPreset(settings.presetId);
  if (!preset) return;
  const next = { ...settings, cameraHfovDeg: preset.cameraHfovDeg };
  applySettings(next);
  panel.set(next);
  dialog.setStatus(`Reset to preset HFOV ${preset.cameraHfovDeg.toFixed(1)}°`);
});

inset.onCalibrateButton(() => {
  // Reopening mid-run would make a running dialog look idle.
  if (calibration) return;
  if (closeTimer !== null) clearTimeout(closeTimer);
  closeTimer = null;
  dialog.open();
});

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
  if (scene === 'game') return;
  if (e.target instanceof Element && e.target.closest('input, select, textarea, button, summary')) return;
  e.preventDefault();
  toggleFollowing();
});
els.correctedBox.addEventListener('click', toggleFollowing);
els.followToggle.addEventListener('click', toggleFollowing);
createSceneSwitch(els.topbar, scene).onChange((next) => {
  scene = next;
  document.body.dataset.scene = next;
  // The text stage was display:none, so its layout must be measured now.
  remeasure();
  // The session survives switching away, so returning resumes the same level.
  if (next === 'game') {
    // Fill the HUD before showing it so it never flashes empty.
    hud.update(hudState(gameView(session, Infinity)));
    startGameLoop();
  }
  hud.show(next === 'game');
});
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
