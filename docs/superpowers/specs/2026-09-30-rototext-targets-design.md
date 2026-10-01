# RotoText Targets Scene — Design Spec

**Date:** 2026-09-30
**Status:** Draft for review
**Builds on:** `docs/superpowers/specs/2026-09-30-rototext-design.md` (tracking, smoothing,
settings, Tune panel and coordinate systems are reused unchanged unless stated here).

## 1. Intent

The corrected-text effect is invisible when it works, so it isn't striking. Add a
head-tracked **"window into a box"** scene in the style of Johnny Lee's Wii head-tracking
demo: the MacBook screen becomes a window onto a shallow 3D box with ring targets
floating at different depths, two of them in front of the glass. Add one-click camera
calibration so depth feels solid.

**Stated by Sean**
- The current effect "isn't as striking as I expected"; wants something noticeably cooler.
- Chose: virtual 3D scene, **MacBook first**, **Johnny Lee targets** as the content,
  rendering approach **A** (SVG + pure point projection).
- Approved: one-click calibration (Part 2), scene switch / failure handling / testing (Part 3).

**Assumed (agreed during brainstorming)**
- The existing text scene stays, behind a **Targets / Text** switch; Targets is the default.
- Works within the face tracker's field of view (~±30°) from a normal seat.

**Success criteria**
- After calibrating, leaning left/right/up/down makes the targets and box walls slide with
  convincing motion parallax; the two front targets read as floating in front of the glass.
- The box's front edge stays locked to the viewport edges while moving and after resize.
- **Static** (same toggle as the text scene) shows the scene from a fixed frontal eye, so the
  head-tracked difference is obvious instantly.
- Calibration is one click after sitting at 50 cm and is remembered per device preset.

## 2. Non-goals

- Lighting, shadows, textures, Three.js/WebGL.
- iPhone layout and tuning for this scene (MacBook first; iPhone may run it untuned).
- Text inside the box.
- Automatic calibration of camera height (slider remains).
- Animation of the targets (they are static in the world; only the viewpoint moves).

## 3. World and scene geometry

World coordinates are the existing **screen space** (mm, origin at screen centre, +x right,
+y up, +z toward the viewer; the screen is z = 0).

**Viewport rectangle (mm):** `viewportToScreenMm` of viewport corners `(0, 0)` and
`(innerWidth, innerHeight)` → `left, right, top, bottom` in mm. Its centre is `V`.

**Box:** the viewport rectangle extruded to depth `BOX_DEPTH_MM = 250` (z from 0 to −250).
Five walls: back (z = −250), floor (y = bottom), ceiling (y = top), left (x = left),
right (x = right). Each wall carries a grid with spacing `GRID_MM = 25`: lines parallel to
each of the wall's two in-plane axes, from wall edge to wall edge, including the edges.
The box's front edges coincide with the viewport edges (z = 0) — the key illusion.

**Targets:** 8 hand-placed targets, positioned in viewport-relative fractions
`(fx, fy)` of the viewport width/height from `V`, depth `z` (mm), radius `r` (mm):

| # | fx | fy | z (mm) | r (mm) |
|---|---|---|---|---|
| 1 | −0.30 | 0.20 | −200 | 18 |
| 2 | 0.25 | 0.28 | −150 | 16 |
| 3 | 0.05 | −0.05 | −90 | 20 |
| 4 | −0.18 | −0.30 | −40 | 14 |
| 5 | 0.35 | −0.22 | −220 | 22 |
| 6 | −0.38 | −0.05 | −120 | 15 |
| 7 | 0.12 | 0.12 | +25 | 12 |
| 8 | −0.08 | −0.18 | +40 | 12 |

Each target is three concentric discs facing +z at its depth — radii `r`, `0.66r`, `0.33r`,
filled red `#e5484d`, white `#f4f1ea`, red — approximated as 48-gons. Each target has a
**stick**: a line from its centre straight back to the back wall (same x, y; z → −250).

**Depth cue:** for anything behind the screen, the cue amount is
`1 − 0.5 · (−z / BOX_DEPTH_MM)`; line width (px) = `1.5 − 0.75 · (−z / BOX_DEPTH_MM)` for
grid lines (z from the line's midpoint). Discs are fogged toward the background colour
`#0e0f12` by `1 −` that amount and drawn opaque (so nothing shows through them and white
rings stay white); lines use it as stroke opacity. Objects in front of the glass are
unfogged and fully opaque.

## 4. Projection (`src/geometry/perspective.ts`, pure)

```ts
projectPoint(eye: Vec3, q: Vec3, frame: ScreenFrame): Point2 | null
```

1. `e = vec3(eye.x, eye.y, Math.max(eye.z, MIN_EYE_Z_MM))` (100 mm, from projection.ts).
2. If `!isFinite` anywhere, or `e.z − q.z < MIN_DEPTH_RATIO · e.z` (0.25, from
   projection.ts) → `null` (point at, behind, or too close to the eye's depth).
3. `P = e + (q − e) · e.z / (e.z − q.z)` (reuse `projectToScreenPlane`), then
   `screenMmToViewport(P, frame)` → viewport px.

A primitive (polygon or line) with any `null` vertex is not drawn this frame.

## 5. Modules

| Module | Responsibility | Pure |
|---|---|---|
| `src/geometry/perspective.ts` | `projectPoint` | yes |
| `src/scene/targets.ts` | Build the box + targets as 3D primitives from the viewport rect (mm) | yes |
| `src/scene/svgRenderer.ts` | Create SVG elements once; per frame project and update `points` / `x1…y2` / opacity; hide primitives with null vertices | no |
| `src/tracking/calibration.ts` | `hfovFromIris` math | yes |
| `src/calibrationStore.ts` | Per-preset HFOV persistence over an injected `Storage` | yes (given storage) |
| `src/ui/calibrateDialog.ts` | The calibration prompt (Start / Cancel / status text) | no |
| `src/ui/sceneSwitch.ts` | Top bar: `Targets | Text` switch + the Following/Static toggle | no |

**Scene primitives** (`targets.ts`):

```ts
type Primitive =
  | { kind: 'line'; a: Vec3; b: Vec3; depth: number; role: 'grid' | 'stick' }
  | { kind: 'polygon'; points: Vec3[]; depth: number; fill: string };
interface ViewportRectMm { left: number; right: number; top: number; bottom: number }
buildTargetsScene(rect: ViewportRectMm): Primitive[]   // sorted far → near (painter's order)
viewportRectMm(frame: ScreenFrame, innerWidth: number, innerHeight: number): ViewportRectMm
```

`depth` is the primitive's mean z (used for sorting and the depth cue). Sort order: grid
lines, then sticks, then target discs, each by ascending z (farthest first); within a
target, larger disc first.

## 6. Calibration

**UI:** a **Calibrate** button in the inset (camera mode only) opens `#calibrate`, a small
centred panel: *"Sit with your eyes 50 cm from the screen, facing it. Hold still and click
Start."* Buttons: **Start**, **Cancel**, and a **Reset** link that clears the saved value
for the current preset.

**Collection:** after Start, main.ts pushes the larger iris diameter (px) from each tracked
frame for 1000 ms, plus the frame width. Frames with no face are skipped.

**Math** (`src/tracking/calibration.ts`):

```ts
CALIBRATION_DISTANCE_MM = 500
MIN_CALIBRATION_SAMPLES = 15
hfovFromIris(irisPxSamples: number[], frameWidthPx: number,
             irisDiameterMm = 11.7, distanceMm = 500): number | null
```

- Fewer than 15 samples → `null`.
- `irisPx = median(samples)`; `f = distanceMm · irisPx / irisDiameterMm`;
  `hfov = 2 · atan((frameWidthPx / 2) / f)` in degrees.
- Result outside 30–120° or non-finite → `null`.

**Exposed estimator helper:** `largerIrisDiameterPx(lm, w, h)` in `eyeEstimator.ts`
(the max of the two eyes' `irisDiameterPx`), reused by `estimateEye`.

**Outcome:** success → `applySettings({ ...settings, cameraHfovDeg: hfov })` (the Tune slider
follows), save to the store, status *"Calibrated: HFOV 63.5°"*, panel closes after 1.5 s.
Failure → *"No steady face found — try again"*; settings unchanged.

**Persistence** (`src/calibrationStore.ts`): key `rototext.hfov.<presetId>`; API
`createCalibrationStore(getStorage: () => Storage | undefined)` returning
`{ load(presetId): number | null; save(presetId, hfov): void; clear(presetId): void }`.
Every access is wrapped in try/catch; a throwing or missing storage behaves as empty.
Loaded at startup and whenever the Tune preset changes (a saved value overrides the
preset's HFOV).

## 7. Scene switch and integration

- **Top bar** (`#topbar`, fixed, top centre): segmented `Targets | Text` buttons
  (`aria-pressed`), then the existing **Following you / Static** toggle (moved here from
  under the headline so it works in both scenes).
- **Targets scene:** `#stage` (text) hidden; full-viewport `<svg id="scene">` shown.
- **Text scene:** unchanged from the current build; on switching to it, re-measure layout.
- **View centre** for the inset readout and the resting eye: headline centre in the text
  scene, viewport centre `V` in the targets scene. Resting eye = view centre +
  `referenceDistanceMm · ẑ` (unchanged rule).
- **Static** in the targets scene renders from the resting eye (`V + referenceDistanceMm·ẑ`).
- Switching scenes keeps the camera, tracker, smoother and target controller running.
- Space / Following toggle behaviour is unchanged; the scene switch buttons are ignored by
  the Space handler (they are buttons).

## 8. Failure handling

| Condition | Behaviour |
|---|---|
| Point at/behind/too close to the eye's depth (defensive; unreachable for the §3 scene since eye z ≥ 100 mm and targets z ≤ 40 mm) | Its primitive is hidden this frame |
| No face | Existing ease-to-rest (view centre + reference distance) |
| Resize / fullscreen / window move | Rebuild the viewport rect and the scene geometry |
| Calibration: no face, < 15 samples, out-of-range HFOV | Status message; settings unchanged |
| `localStorage` unavailable or throwing | Store behaves as empty; calibration still applies for the session |

## 9. Testing

**Unit (Vitest)**
- `perspective`:
  - A point on the screen plane (z = 0) maps to itself (via `screenMmToViewport`).
  - Frontal eye: a point behind the screen projects closer to the eye's foot point than
    its own (x, y) — i.e. toward the view centre.
  - Parallax: with the eye moved right, a point behind the screen moves right on screen
    and a point in front of the screen moves left.
  - Points with `e.z − q.z < 0.25 · e.z`, and non-finite inputs, return `null`.
- `targets`:
  - Deterministic (two builds are deep-equal).
  - 8 targets × 3 discs and 8 sticks present; all target centres inside the box's x/y
    range; depths within −250…+40; at least one target with z > 0.
  - Every grid line lies on its wall's plane and within the wall's bounds.
  - The box's front edges equal the viewport rectangle.
  - Output is sorted far → near per §5.
- `calibration`: synthetic iris sizes from a known HFOV at 500 mm recover that HFOV within
  0.1°; one outlier sample does not move the result (median); < 15 samples → `null`;
  out-of-range → `null`.
- `calibrationStore`: save/load/clear round-trip on a fake storage; a storage whose methods
  throw, and an undefined storage, both behave as empty without throwing.
- `eyeEstimator.largerIrisDiameterPx`: matches the larger eye.

**Manual (Sean, MacBook)**
1. Calibrate at 50 cm; the HFOV readout updates and survives a reload.
2. Lean left/right/up/down: targets and walls slide with parallax; front targets float in
   front of the glass; box edges stay on the window edges.
3. Static vs Following makes the difference obvious.
4. Get very close (~10 cm): the front targets grow large but stay coherent shapes — no
   smearing or exploding polygons (the eye depth is clamped to 100 mm).
5. Switch to Text and back: the text scene behaves as before.
