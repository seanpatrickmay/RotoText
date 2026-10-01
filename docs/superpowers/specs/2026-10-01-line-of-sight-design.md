# Line of Sight — Design Spec

**Date:** 2026-10-01
**Status:** Draft for review
**Builds on:** `docs/superpowers/specs/2026-09-30-rototext-targets-design.md` (box scene,
`projectPoint`, screen space, tracking, smoothing and calibration are reused unchanged unless
stated here).

## 1. Intent

A short head-tracked puzzle game. Line segments float at different depths inside the box and
look like scattered fragments; from exactly one eye position they line up into a shape on the
glass. The player moves their head to find that viewpoint and holds it to solve the level.

**Stated by Sean**
- Chose Line of Sight from the game ideas.
- Demo-length: 5–8 hand-made levels, ~2–3 minutes total.
- Shapes: simple outlines first, the final level spells **ROTO**.
- Guidance: a faint ghost outline on the glass plus warmth as the eye nears the solution.
- Approved: build-from-2D generation (Part 1), game flow (Part 2), modules/testing (Part 3).

**Assumed (agreed during brainstorming)**
- MacBook first; playable in mouse mode; a third option in the existing scene switch.
- Targets stays the default scene.

**Success criteria**
- From a normal frontal seat every level looks scrambled; from its solution eye it forms the
  ghost shape exactly.
- A player can find and hold each solution with the warmth cue alone, without instructions.
- Solving feels like a payoff: the pieces fly to the glass and the shape becomes solid.
- All 7 levels and the end screen are reachable in camera mode and in mouse mode.

## 2. Non-goals

Saved progress, level select, scores, timers, sound, procedural levels, iPhone tuning,
filled/coloured artwork, Three.js/WebGL.

## 3. Core mechanic

**Key property.** The screen shows the scene projected from the *tracked* eye. Whether the
pieces form the shape is a property of that 2D screen image, so it depends only on the tracked
eye, not on the player's true eye. Calibration error moves the real-world sweet spot; it never
makes a level unsolvable. Alignment is therefore measured in viewport px from the rendered eye.

**Coordinates.** Screen space (mm, origin at screen centre, +x right, +y up, +z toward the
viewer, glass at z = 0). The viewport rectangle `rect` and its centre `V` come from
`viewportRectMm` / `rectCenter` (targets spec §3).

**Solution eye.** `E* = V + (offset.x, offset.y, SOLUTION_DISTANCE_MM)`,
`SOLUTION_DISTANCE_MM = 500` (fixed; independent of the Tune reference-distance slider).

**Outline → glass.** A level's outline is a list of polylines in unit coordinates
(x, y ∈ [−1, 1], +y up). It is placed on the glass at
`P = V + u · SHAPE_HALF_SIZE`, where `SHAPE_HALF_SIZE = 0.3 · min(rectWidth, rectHeight)`
(mm), z = 0.

**Segmentation.** Each polyline edge is split evenly into the fewest pieces of length
≤ `SEGMENT_MM = 25`. Each resulting glass segment `(P1, P2)` becomes one piece.

**Depth.** Each piece gets one depth `d` (mm behind the glass, positive), drawn in piece order
from a seeded mulberry32 PRNG (`level.seed`), uniform in `[depthMin, depthMax]`. A draw is
rejected and redrawn (up to 20 tries, then accepted) while
`|d − dPrev| < min(60, 0.5 · (depthMax − depthMin))`.

**Lift into 3D.** Both endpoints move along their own ray from `E*` to depth `d`:
`Q = P + (P − E*) · d / E*.z` (x and y; `Q.z = −d`). Both endpoints share `z = −d`, so the
piece is a straight segment that projects from `E*` exactly onto `(P1, P2)`.

**Box clamp.** Off-centre rays diverge with depth. If either endpoint of a piece would leave
`rect` shrunk by `BOX_MARGIN_MM = 5` (x or y), reduce `d` to the largest value that keeps both
endpoints inside (closed form per axis: `d ≤ (wall − P) · E*.z / (P − E*)` for the wall the ray
heads toward), then `d = max(d, depthMin)`; if that still leaves the box, keep `d = depthMin`
(tests prove this never happens for the shipped levels on the test frames).

**Ghost.** The glass segments `(P1, P2)` themselves (z = 0, so they project to themselves from
any eye).

**Misalignment.** `misalignmentPx(eye, pieces, frame)` = the mean, over every piece endpoint,
of the viewport-px distance between `projectPoint(eye, Q, frame)` and
`screenMmToViewport(P, frame)`. Any `null` projection → `Infinity`.

**Solve rule.**
- `SOLVE_PX = 8`, `RESET_PX = 12`, `HOLD_MS = 800`.
- While playing: if `misalignment < SOLVE_PX`, or if a hold is under way and
  `misalignment ≤ RESET_PX`, the hold accumulates `dt`; otherwise the hold resets to 0.
- `dt` per tick is clamped to ≤ 100 ms (a backgrounded tab cannot solve instantly).
- Hold ≥ `HOLD_MS` → solved.

**Sensitivity (informative).** At 500 mm with depths 30–240 mm, mean misalignment grows by
≈ 0.18 mm per mm of lateral eye error, so 8 px (~1.6 mm on a 16" MacBook Pro) ≈ ±7 mm of head
tolerance. Depth spread is the difficulty knob.

## 4. Levels

| # | Name | Outline | Offset x, y (mm) | Depth (mm) | Seed |
|---|---|---|---|---|---|
| 1 | Ring | 32-gon circle, radius 1 | +100, 0 | 20–100 | 1 |
| 2 | Triangle | equilateral, circumradius 1, apex up | −120, +40 | 20–140 | 2 |
| 3 | Arrow | right-pointing block arrow outline | 0, +80 | 30–160 | 3 |
| 4 | Star | 5-point star outline, inner radius 0.4 | −150, +20 | 30–200 | 4 |
| 5 | Linked rings | two 24-gon circles r = 0.55, centres (±0.4, 0) | +120, +80 | 30–220 | 5 |
| 6 | Key | ring bow (16-gon, r = 0.35, centre (−0.55, 0)) + shaft to (0.9, 0) + two teeth down 0.25 at x = 0.55 and 0.8 | +180, 0 | 30–240 | 6 |
| 7 | ROTO | four stroke letters R, O, T, O, each 0.4 wide × 0.7 tall, 0.1 gaps, centred | −150, +100 | 30–240 | 7 |

Every solution eye stays within 15° vertically and 25° horizontally of the webcam (not of V),
so the face stays well inside the camera frame.

Exact polyline coordinates live in `shapes.ts`; every outline stays within the unit square.
Values are a starting point to tune after play-testing.

## 5. Game flow and feedback

**Entry.** The scene switch becomes `Targets | Text | Line of Sight` (`game`). In the game
scene: `#stage` hidden; `#scene` shows only the box grid at CSS `opacity: 0.35`; `#game`
(full-viewport SVG) shows ghost and pieces; the Following/Static toggle is hidden and Space
does nothing.

**HUD** (`#game-hud`, under the top bar, centred): `3 / 7 · Star`, a **Skip** button, and a
thin hold-progress bar.

**Per level.**
1. *Playing:* pieces drawn from the current eye; ghost as dashed lines
   (`stroke-dasharray: 6 6`), colour `#f4f1ea`, opacity 0.15.
2. *Warmth:* piece stroke colour = RGB lerp from `#5b6b8c` (misalignment ≥ 120 px) to
   `#ffb547` (≤ `SOLVE_PX`), linear in px between.
3. *Hold:* progress bar = hold / `HOLD_MS`; piece stroke width `3 + 2 · progress` px.
4. *Solving:* for `FLY_MS = 600`, each piece is drawn at `pieceAt(piece, t)` with
   `t = elapsed / FLY_MS` eased (ease-out cubic): linear interpolation from `Q` to `P`. Both
   lie on the same ray from `E*`, so the shape stays aligned from `E*` throughout and ends flat
   on the glass. Colour `#f4f1ea` for the first 200 ms, then `#ffb547`. Then a
   `PAUSE_MS = 1200` hold on the solved shape, then the next level.
5. *Done:* after level 7, the HUD shows *"You found every line of sight"* and **Play again**
   (restarts at level 1).

**Skip** advances immediately to the next level (from level 7: to Done).

## 6. Modules

| Module | Responsibility | Pure |
|---|---|---|
| `src/game/shapes.ts` | The 7 outlines as `Point2[][]` in unit coordinates | yes |
| `src/game/levels.ts` | `LEVELS: LevelSpec[]` (§4) | yes |
| `src/game/pieces.ts` | `buildLevel(level, rect): BuiltLevel`; `pieceAt(piece, t)`; mulberry32 | yes |
| `src/game/alignment.ts` | `misalignmentPx`; `warmthColor(px)` | yes |
| `src/game/session.ts` | Session state machine (§3 solve rule, §5 phases), `skip`, `restart` | yes |
| `src/scene/gameRenderer.ts` | `<svg id="game">`: create ghost + piece elements per level; per frame project and set coordinates, colour, width | no |
| `src/ui/gameHud.ts` | Level label, Skip, progress bar, end screen (textContent only) | no |

```ts
interface LevelSpec { name: string; outline: Point2[][]; offset: Point2;
                      depthMin: number; depthMax: number; seed: number }
interface Piece { glass: [Vec3, Vec3]; lifted: [Vec3, Vec3] }
interface BuiltLevel { solutionEye: Vec3; pieces: Piece[] }
type Phase = 'playing' | 'solving' | 'done';
interface Session { levelIndex: number; phase: Phase; holdMs: number; phaseMs: number }
stepSession(s: Session, misalignmentPx: number, dtMs: number, levelCount: number): Session
```

**Changes to existing modules.**
- `src/scene/targets.ts`: export `buildBoxGrid(rect)` (the sorted grid primitives).
- `src/ui/sceneSwitch.ts`: `SceneName` gains `'game'`; a third button.
- `src/styles.css`: `body[data-scene='game']` rules (§5); `#game`, `#game-hud`.
- `index.html`: `<svg id="game" aria-hidden="true">`, `<div id="game-hud" hidden>`.
- `src/main.ts`: in the game scene, `#scene` renders the grid only; a dedicated
  `requestAnimationFrame` loop runs while `scene === 'game'` (so the hold completes in mouse
  mode with a still pointer). Each tick: `misalignmentPx(lastEye ?? restingEye(), …)` →
  `stepSession` → `gameRenderer.render` → HUD update. Remeasure rebuilds the current level and
  resets the hold. `viewCenter()` is `V` in the game scene. The game always renders from the
  tracked eye, ignoring `following`; the Space handler returns early when `scene === 'game'`.

## 7. Failure handling

| Condition | Behaviour |
|---|---|
| No face | Existing ease-to-rest; the hold resets naturally (misalignment rises) |
| Any piece projection `null` | Misalignment `Infinity`; that piece hidden this frame |
| Resize / fullscreen / window move | Rebuild the current level for the new `rect`; hold resets |
| Tab hidden | rAF pauses; `dt` clamp prevents an instant solve on return |
| Mouse mode | Fully playable; the game loop ticks independently of input events |
| Mouse mode in the game | Eye distance locked to 500 mm (wheel and pinch ignored) so every level stays solvable |

## 8. Testing

**Unit (Vitest)**, run for every level on two frames: 16" (preset `mbp-16`, viewport
1728 × 1000 CSS px) and 13" (preset `mba-13`, viewport 1440 × 800):
- From `solutionEye`, every piece endpoint projects onto its glass point within 1e-6 px;
  `misalignmentPx(solutionEye) < 1e-6`.
- From the resting eye `V + 500ẑ`, `misalignmentPx > 40`.
- From `solutionEye` moved 30 mm in x (and separately in y), `misalignmentPx > 12`.
- Every lifted endpoint lies inside `rect` (with margin) and `z ∈ [−depthMax, −depthMin]`.
- Camera-relative: `atan2(|eye.y − camera.y|, eye.z) ≤ 15°` and `atan2(|eye.x|, eye.z) ≤ 25°` for
  every level on every test frame (camera at `(0, preset.cameraOffsetMm.y)`).
- Builds are deterministic; every segment length ≤ 25 mm (+1e-9).
- `pieceAt`: t = 0 → lifted, t = 1 → glass, and the projection from `solutionEye` is constant
  for t ∈ {0, 0.25, 0.5, 1}.
- `stepSession`: hold accumulates below 8 px; a 10 px sample mid-hold keeps it; > 12 px resets;
  solves at 800 ms; `dt` clamped to 100 ms; solving → next level after `FLY_MS + PAUSE_MS`;
  after the last level → `done`; `skip` and `restart`.
- `warmthColor`: ≥ 120 px → `#5b6b8c`, ≤ 8 px → `#ffb547`, output `#rrggbb`.
- Shapes: every point within the unit square.

**Manual (Sean, MacBook)**
1. Play all 7 levels in camera mode; note how tight 8 px feels.
2. Play two levels in mouse mode, including holding with a still pointer.
3. ROTO reads clearly when solved; the solve flight looks aligned throughout.
4. Resize the window mid-level: the level rebuilds and stays solvable.
5. Switch to Targets and Text and back: both behave as before.
