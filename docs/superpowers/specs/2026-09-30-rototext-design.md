# RotoText — Design Spec

**Date:** 2026-09-30
**Status:** Draft for review

## 1. Intent

Text on a screen that reshapes itself based on where the viewer's eyes are, so that
from the viewer's position it always looks flat and face-on — readable even when the
screen is seen at a steep angle. A web-app proof of concept for MacBook and iPhone.

**Stated by Sean**
- Text changes dimensions based on viewing angle so it stays readable at a tilt.
- Proof of concept, MacBook + iPhone, web app preferred.
- Driven by real-time 3D eye position from the front camera.
- Purpose: **demo / portfolio piece**.
- Demo must include: an on/off toggle, a side-by-side uncorrected copy, and a tracking inset.
- Calibration: device presets + tuning sliders (no calibration step for viewers).
- Approach A: MediaPipe tracking + CSS `matrix3d` on real DOM text.

**Assumed (agreed during brainstorming)**
- The effect is anamorphic correction: correct for the viewer's eye, not for the device.
- Only eye position *relative to the screen* matters; the camera is rigidly attached to
  the screen, so device tilt and head motion are the same input. No gyroscope.
- Single viewer; use the midpoint between both eyes (a flat screen can't serve each eye).
- iPhone in portrait only; MacBook in landscape.

**Success criteria**
- On both a MacBook and an iPhone, a viewer looking from ~45° off-axis sees the corrected
  headline as visibly rectangular and upright, while the uncorrected copy is visibly skewed.
- Toggling correction off/on makes the difference obvious instantly.
- Motion feels live: no visible jitter when still, no distracting lag when moving.
- Works with zero setup for a viewer on a listed device; degrades to mouse mode otherwise.

## 2. Non-goals (v1)

- Constant apparent size as the viewer moves closer/farther (billboard keeps physical size).
- Three.js / off-axis 3D scene ("window into a box").
- Landscape iPhone, iPad, multiple viewers, per-eye stereo correction.
- Credit-card / physical calibration flow.
- Arbitrary page content — the demo corrects a small number of known text elements.
- Choosing a host and deploying (the build is static so this is easy later).

## 3. Stack

- Vite + TypeScript, no UI framework.
- Runtime dependency: `@mediapipe/tasks-vision` (FaceLandmarker). Model file
  (`face_landmarker.task`) and WASM assets are self-hosted from `public/`.
- Dev dependencies: Vitest, `@vitejs/plugin-basic-ssl`.
- Versions pinned; `npm audit` run after install.

## 4. Architecture

```
video frame → faceTracker → eyeEstimator → smoothing → screenSpace
           → projection(eye, elementRect) → element.style.transform
```

Driven by `requestVideoFrameCallback` so work happens only on new camera frames.
In mouse mode, the pointer replaces the first three stages.

### Modules

| Module | Responsibility | Pure |
|---|---|---|
| `src/tracking/camera.ts` | Open front camera via `getUserMedia` (640×480, `facingMode: "user"`); `<video playsinline muted>` | no |
| `src/tracking/faceTracker.ts` | Wrap FaceLandmarker in `VIDEO` mode, GPU delegate with CPU fallback; return landmarks of the largest face or `null` | no |
| `src/tracking/eyeEstimator.ts` | Landmarks + frame size + camera FOV → eye position in camera space (mm) | yes |
| `src/tracking/smoothing.ts` | One-euro filter over 3D points | yes |
| `src/tracking/targetController.ts` | Face-lost hold/ease and reacquire blend (§8) | yes |
| `src/geometry/vec3.ts` | Small 3D vector helpers | yes |
| `src/settings.ts` | Tunable settings derived from a preset; builds the screen frame | yes |
| `src/geometry/devices.ts` | Device presets and auto-guess | yes |
| `src/geometry/screenSpace.ts` | Camera space → screen space | yes |
| `src/geometry/projection.ts` | Eye position + element rect → CSS `matrix3d` string | yes |
| `src/ui/demo.ts` | Page layout, corrected headline, uncorrected copy, toggle | no |
| `src/ui/inset.ts` | Webcam preview, eye-point overlay, angle/distance/FPS readout | no |
| `src/ui/debugPanel.ts` | Preset dropdown and tuning sliders | no |
| `src/ui/mouseMode.ts` | Pointer/touch → simulated eye position | no |
| `src/main.ts` | Wire-up and frame loop | no |

### Coordinate systems

- **Camera space** (mm): origin at camera, +x to the camera image's right, +y down the
  image, +z out of the camera toward the viewer.
- **Screen space** (mm): origin at the screen's centre, +x to the viewer's right,
  +y up, +z out of the screen toward the viewer. The screen is the plane z = 0.
- **Element space** (CSS px): the element's own box, origin at its top-left, +y down.

## 5. Device presets

Each preset holds:

```ts
interface DevicePreset {
  id: string;
  label: string;
  kind: 'mac' | 'iphone';
  screenWidthMm: number;   // visible display area
  screenHeightMm: number;
  cameraOffsetMm: { x: number; y: number }; // camera position in screen space
  cameraHfovDeg: number;   // horizontal FOV of the stream as delivered (portrait on iPhone)
  nominalCssWidthPx: number; // default `screen.width`, used only by auto-guess
}
```

Initial list: MacBook Air 13", MacBook Pro 14", MacBook Pro 16", iPhone 6.1" (15/16),
iPhone 6.7" (15/16 Plus / Pro Max).

Value sources:
- Screen size = native resolution ÷ ppi × 25.4, from Apple's published tech specs.
- Camera offset = centred horizontally (x = 0); y = half the screen height plus the
  bezel gap to the lens, measured or taken from published dimensions.
- `cameraHfovDeg` defaults to 70° and is tuned per device with the procedure in §9.

Auto-guess: touch device with portrait aspect → closest iPhone preset by CSS screen
size; otherwise closest MacBook preset. The choice is shown and overridable in the debug panel.

`mmPerCssPx = screenWidthMm / window.screen.width` (portrait width on iPhone).

**Viewport → screen offset.** Element rects are in viewport px, but projection needs
screen-space mm, so we need the viewport's top-left on the physical screen (CSS px):
- Desktop: `(window.screenX, window.screenY + window.outerHeight − window.innerHeight)`.
- iPhone: `(0, 59)` — the status-bar height in CSS px on Dynamic Island iPhones.
  (`env(safe-area-inset-top)` is not reliable inside Safari's browser chrome.)
- A "viewport top offset" debug slider overrides the y value.
- The demo has a Fullscreen button (Fullscreen API on desktop), which makes the offset
  exactly `(0, 0)`; this is the recommended way to present on a MacBook.

An error of ~1 cm here only shifts `C` slightly and is tolerable for the demo.

Debug sliders override: screen width/height, camera offset y, camera HFOV, iris
diameter (default 11.7 mm), one-euro `minCutoff` and `beta`.

## 6. Eye estimation

Input: FaceLandmarker landmarks (normalised to the frame), frame width `W` and height `H` in px.

1. Iris rings: right iris 468–472, left iris 473–477 (centre first, then four ring points).
2. Iris diameter in px for each eye = the larger of its two opposite ring-point
   distances (469↔471 and 470↔472; 474↔476 and 475↔477), with x scaled by `W` and
   y by `H`. Taking the larger pair makes this independent of the (undocumented)
   ring order and of pitch/yaw foreshortening. Then use the **larger** of the two
   eyes — head yaw foreshortens the farther iris.
3. Focal length in px: `f = (W / 2) / tan(hfov / 2)`.
4. Depth: `Z = f · irisMm / irisPx`.
5. Eye midpoint in px `(u, v)` = average of the two iris centres.
6. `X = (u − W/2) · Z / f`, `Y = (v − H/2) · Z / f`.

Output: `{ x: X, y: Y, z: Z }` in camera space, mm.

**Screen-space conversion** (`screenSpace.ts`): the front camera faces the viewer, so
the viewer's right is the camera image's left, and image-down is screen-down:

```
E.x = cameraOffset.x − X
E.y = cameraOffset.y − Y
E.z = Z
```

Signs are pinned by unit tests (§9) and checked by the first manual test on hardware.

## 7. Projection

For each corrected element with screen-space centre `C` (z = 0) and size `w × h` mm
(from `getBoundingClientRect` of the untransformed layout box × `mmPerCssPx`):

1. **Clamp the eye.** `E.z ≥ 100 mm`, and the angle between `E − C` and the screen
   normal is at most 75°. Beyond that, the eye is moved back onto the cap (same azimuth).
2. **Billboard basis.** `n = normalize(E − C)`, `u = normalize(ŷ × n)`, `v = n × u`.
   For a frontal eye this gives `u = x̂`, `v = ŷ`.
3. **Billboard corners.** `Q = C ± u·w/2 ± v·h/2`.
4. **Project onto the screen** from `E`: `P = E + t·(Q − E)`, `t = E.z / (E.z − Q.z)`.
5. **Convert** each `P` to element space (CSS px, y down, relative to the element's
   top-left).
6. **Homography.** Solve the 3×3 `H` that maps element corners
   `(0,0), (wPx,0), (wPx,hPx), (0,hPx)` to the four projected points (8×8 linear solve).
7. **Emit** `matrix3d` in CSS column-major order with `transform-origin: 0 0`:

```
matrix3d(h11, h21, 0, h31,
         h12, h22, 0, h32,
         0,   0,   1, 0,
         h13, h23, 0, h33)
```

Layout rects are measured once (and on resize), never from the transformed element.

**Degenerate guard.** A large element seen at a steep angle can have a billboard corner
reach toward (or past) the eye's depth, which sends `t` to infinity. If any corner has
`E.z − Q.z < 0.25 · E.z`, or the homography solve is singular, the projection returns
`null` and the caller keeps the last valid transform.

## 8. Failure handling

| Condition | Behaviour |
|---|---|
| Camera denied / unavailable / insecure context | Banner with the reason; switch to mouse mode |
| Model or WASM fails to load | Banner; switch to mouse mode |
| GPU delegate fails | Retry FaceLandmarker with CPU delegate |
| No face for > 300 ms | Ease the target eye to the point 500 mm directly in front of the headline's centre (`C + 500·ẑ`, which yields the identity transform) over ~0.5 s; inset shows "no face" |
| Face reacquired | Resume tracking through the smoother (no snap) |
| Window resize / preset change | Re-measure layout rects and `mmPerCssPx` |

**Mouse mode:** pointer x/y over the viewport maps to eye x/y in screen space; wheel
(desktop) or two-finger pinch (iPhone) changes distance (default 500 mm); one-finger
drag on iPhone moves the eye. A button in the inset switches back to camera mode.

**Toggle:** Space (desktop) or tapping the headline (iPhone) sets the corrected
element's transform to `none`; a label shows "Correction: ON / OFF".

**HTTPS:** `vite --host` with `@vitejs/plugin-basic-ssl` for LAN testing on iPhone
(accept the self-signed certificate once). Production build is a static `dist/`.

## 9. Testing

**Unit (Vitest), pure modules only**
- `eyeEstimator`: synthesise landmarks for a known eye position and FOV; recover it
  within 1 mm. Larger-iris selection when one iris is foreshortened.
- `screenSpace`: an eye up-and-right of the camera (from the viewer's point of view)
  yields +x and +y relative to the camera offset.
- `projection`:
  - Frontal eye directly in front of `C` → identity matrix (within 1e-9).
  - Lines from `E` through the four projected points hit a true rectangle of size
    `w × h` facing `E` (round-trip).
  - Eye beyond the 75° cap and below 100 mm → finite output equal to the capped result.
  - Output string has 16 finite numbers in column-major order.
- `smoothing`: constant input → constant output; a step converges; no NaN on the first sample.
- `devices`: every preset has positive dimensions and an HFOV in (30°, 120°); auto-guess
  picks an iPhone preset for a portrait touch screen and a MacBook preset otherwise.

**Manual, on a MacBook and an iPhone**
1. Sign check: move your head left/right/up/down; the eye dot and readout move the same way.
2. FOV tune: sit at a tape-measured 50 cm; adjust HFOV until the distance readout reads
   50 cm; record the value back into the preset.
3. Distance check at 30 cm and 80 cm: readout within ±15%.
4. At ~45° off-axis, the corrected headline looks rectangular and upright; the
   uncorrected copy looks skewed; toggling makes the difference obvious.
5. Cover the camera: text eases back to frontal; uncover: tracking resumes without a snap.
6. Deny camera permission: banner + working mouse mode.

## 10. Project layout

```
RotoText/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  public/mediapipe/   # generated by scripts/fetch-assets.mjs, git-ignored
    face_landmarker.task
    wasm/vision_wasm_*.{js,wasm}
  src/
    main.ts
    settings.ts
    tracking/{camera,faceTracker,eyeEstimator,smoothing,targetController}.ts
    geometry/{vec3,devices,screenSpace,projection}.ts
    ui/{demo,inset,debugPanel,mouseMode}.ts
    styles.css
  scripts/fetch-assets.mjs   # copies MediaPipe WASM + downloads the model into public/
  tests/
    settings.test.ts
    tracking/{eyeEstimator,smoothing,targetController}.test.ts
    geometry/{vec3,devices,screenSpace,projection}.test.ts
    ui/mouseMode.test.ts
```
