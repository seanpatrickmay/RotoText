import { describe, expect, it } from 'vitest';
import { COOL_COLOR, WARM_COLOR } from '../../src/game/alignment';
import {
  FLASH_COLOR,
  FLY_MS,
  gameView,
  HOLD_MS,
  initialSession,
  PAUSE_MS,
  resetHold,
  skipLevel,
  stepSession,
  type Session,
} from '../../src/game/session';

const N = 7;
const run = (s: Session, px: number, ticks: number, dt = 40) => {
  for (let i = 0; i < ticks; i++) s = stepSession(s, px, dt, N);
  return s;
};

describe('stepSession', () => {
  it('starts playing level 0 with no hold', () => {
    expect(initialSession()).toEqual({ levelIndex: 0, phase: 'playing', holdMs: 0, phaseMs: 0 });
  });

  it('builds a hold below 8 px and solves at 800 ms of constant input (a still mouse)', () => {
    const s = run(initialSession(), 5, 19);
    expect(s.phase).toBe('playing');
    expect(s.holdMs).toBe(760);
    const solved = stepSession(s, 5, 40, N);
    expect(solved.phase).toBe('solving');
    expect(solved.phaseMs).toBe(0);
  });

  it('keeps a hold through a 10 px blip but resets above 12 px', () => {
    const holding = run(initialSession(), 5, 5);
    const blip = stepSession(holding, 10, 40, N);
    expect(blip.holdMs).toBe(240);
    expect(stepSession(blip, 13, 40, N).holdMs).toBe(0);
  });

  it('does not start a hold between 8 and 12 px', () => {
    expect(run(initialSession(), 10, 10).holdMs).toBe(0);
  });

  it('clamps a long frame gap to 100 ms and treats a negative gap as zero', () => {
    const s = stepSession(initialSession(), 5, 5000, N);
    expect(s.holdMs).toBe(100);
    expect(s.phase).toBe('playing');
    expect(stepSession(s, 5, -50, N).holdMs).toBe(100);
  });

  it('treats a non-finite frame gap as zero', () => {
    const holding = run(initialSession(), 5, 5);
    expect(stepSession(holding, 5, NaN, N).holdMs).toBe(200);
    expect(stepSession(holding, 5, Infinity, N).holdMs).toBe(200);
    const solving: Session = { levelIndex: 0, phase: 'solving', holdMs: HOLD_MS, phaseMs: 100 };
    expect(stepSession(solving, 0, NaN, N).phaseMs).toBe(100);
  });

  it('moves to the next level after the flight and pause', () => {
    const solving: Session = { levelIndex: 2, phase: 'solving', holdMs: HOLD_MS, phaseMs: 0 };
    const almost = run(solving, Infinity, (FLY_MS + PAUSE_MS) / 100 - 1, 100);
    expect(almost.phase).toBe('solving');
    expect(almost.levelIndex).toBe(2);
    expect(stepSession(almost, Infinity, 100, N)).toEqual({ levelIndex: 3, phase: 'playing', holdMs: 0, phaseMs: 0 });
  });

  it('ends after the last level and then stays done', () => {
    const last: Session = { levelIndex: N - 1, phase: 'solving', holdMs: HOLD_MS, phaseMs: FLY_MS + PAUSE_MS - 1 };
    const done = stepSession(last, 0, 40, N);
    expect(done.phase).toBe('done');
    expect(done.levelIndex).toBe(N - 1);
    expect(stepSession(done, 0, 40, N)).toEqual(done);
  });
});

describe('skipLevel', () => {
  it('jumps to the next level, ends from the last, and does nothing when done', () => {
    expect(skipLevel({ levelIndex: 1, phase: 'solving', holdMs: HOLD_MS, phaseMs: 300 }, N)).toEqual({
      levelIndex: 2,
      phase: 'playing',
      holdMs: 0,
      phaseMs: 0,
    });
    const done = skipLevel({ levelIndex: N - 1, phase: 'playing', holdMs: 0, phaseMs: 0 }, N);
    expect(done.phase).toBe('done');
    expect(skipLevel(done, N)).toEqual(done);
  });
});

describe('resetHold', () => {
  it('clears a playing hold but leaves a solve in flight alone', () => {
    expect(resetHold({ levelIndex: 0, phase: 'playing', holdMs: 500, phaseMs: 900 }).holdMs).toBe(0);
    const solving: Session = { levelIndex: 0, phase: 'solving', holdMs: HOLD_MS, phaseMs: 300 };
    expect(resetHold(solving)).toEqual(solving);
  });
});

describe('gameView', () => {
  it('playing: pieces float, colour follows warmth, width grows with the hold', () => {
    expect(gameView({ levelIndex: 0, phase: 'playing', holdMs: 0, phaseMs: 0 }, 500)).toEqual({
      flyT: 0,
      color: COOL_COLOR,
      widthPx: 3,
      progress: 0,
    });
    const v = gameView({ levelIndex: 0, phase: 'playing', holdMs: HOLD_MS / 2, phaseMs: 0 }, 4);
    expect(v.color).toBe(WARM_COLOR);
    expect(v.widthPx).toBe(4);
    expect(v.progress).toBe(0.5);
  });

  it('solving: flashes, then eases the pieces onto the glass', () => {
    const at = (phaseMs: number) => gameView({ levelIndex: 0, phase: 'solving', holdMs: HOLD_MS, phaseMs }, 0);
    expect(at(0).color).toBe(FLASH_COLOR);
    expect(at(0).flyT).toBe(0);
    expect(at(250).color).toBe(WARM_COLOR);
    expect(at(FLY_MS / 2).flyT).toBeCloseTo(1 - 0.5 ** 3, 12);
    expect(at(FLY_MS).flyT).toBe(1);
    expect(at(FLY_MS + 500).flyT).toBe(1);
    expect(at(FLY_MS).widthPx).toBe(5);
    expect(at(FLY_MS).progress).toBe(1);
  });

  it('done: the shape rests on the glass in amber', () => {
    expect(gameView({ levelIndex: N - 1, phase: 'done', holdMs: 0, phaseMs: 0 }, 300)).toEqual({
      flyT: 1,
      color: WARM_COLOR,
      widthPx: 5,
      progress: 1,
    });
  });
});
