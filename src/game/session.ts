import { RESET_PX, SOLVE_PX, warmthColor, WARM_COLOR } from './alignment';

export const HOLD_MS = 800;
export const FLY_MS = 600;
export const PAUSE_MS = 1200;
/** A hidden tab or a debugger pause must not count as holding still. */
export const MAX_TICK_MS = 100;
export const FLASH_MS = 200;
export const FLASH_COLOR = '#f4f1ea';
const BASE_WIDTH_PX = 3;
const HOLD_WIDTH_PX = 2;

export type Phase = 'playing' | 'solving' | 'done';

export interface Session {
  levelIndex: number;
  phase: Phase;
  holdMs: number;
  /** Time spent in the current phase. */
  phaseMs: number;
}

export const initialSession = (): Session => ({ levelIndex: 0, phase: 'playing', holdMs: 0, phaseMs: 0 });

const nextLevel = (s: Session, levelCount: number): Session =>
  s.levelIndex + 1 >= levelCount
    ? { levelIndex: s.levelIndex, phase: 'done', holdMs: 0, phaseMs: 0 }
    : { levelIndex: s.levelIndex + 1, phase: 'playing', holdMs: 0, phaseMs: 0 };

export function stepSession(s: Session, misalignmentPx: number, dtMs: number, levelCount: number): Session {
  const dt = Math.min(Math.max(dtMs, 0), MAX_TICK_MS);
  if (s.phase === 'done') return s;
  if (s.phase === 'solving') {
    const phaseMs = s.phaseMs + dt;
    return phaseMs >= FLY_MS + PAUSE_MS ? nextLevel(s, levelCount) : { ...s, phaseMs };
  }
  // A hold starts below SOLVE_PX and survives small wobbles up to RESET_PX.
  const holding = misalignmentPx < SOLVE_PX || (s.holdMs > 0 && misalignmentPx <= RESET_PX);
  const holdMs = holding ? s.holdMs + dt : 0;
  if (holdMs >= HOLD_MS) return { ...s, phase: 'solving', holdMs: HOLD_MS, phaseMs: 0 };
  return { ...s, holdMs, phaseMs: s.phaseMs + dt };
}

export function skipLevel(s: Session, levelCount: number): Session {
  return s.phase === 'done' ? s : nextLevel(s, levelCount);
}

/** After a resize the pieces move, so a hold in progress no longer means anything. */
export const resetHold = (s: Session): Session => (s.phase === 'playing' ? { ...s, holdMs: 0 } : s);

export interface GameView {
  /** 0 = pieces floating, 1 = flat on the glass. */
  flyT: number;
  color: string;
  widthPx: number;
  /** Hold progress for the HUD bar, 0..1. */
  progress: number;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function gameView(s: Session, misalignmentPx: number): GameView {
  const solvedWidth = BASE_WIDTH_PX + HOLD_WIDTH_PX;
  if (s.phase === 'done') return { flyT: 1, color: WARM_COLOR, widthPx: solvedWidth, progress: 1 };
  if (s.phase === 'solving') {
    return {
      flyT: easeOutCubic(Math.min(1, s.phaseMs / FLY_MS)),
      color: s.phaseMs < FLASH_MS ? FLASH_COLOR : WARM_COLOR,
      widthPx: solvedWidth,
      progress: 1,
    };
  }
  const progress = s.holdMs / HOLD_MS;
  return { flyT: 0, color: warmthColor(misalignmentPx), widthPx: BASE_WIDTH_PX + HOLD_WIDTH_PX * progress, progress };
}
