export const END_MESSAGE = 'You found every line of sight';

export const hudLabel = (levelIndex: number, levelCount: number, name: string): string =>
  `${levelIndex + 1} / ${levelCount} · ${name}`;

export interface GameHudState {
  levelIndex: number;
  levelCount: number;
  levelName: string;
  progress: number;
  done: boolean;
}

export interface GameHud {
  show(visible: boolean): void;
  update(state: GameHudState): void;
  onSkip(handler: () => void): void;
  onRestart(handler: () => void): void;
}

function button(text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  // A mouse click must not leave focus here, or Space would re-click it.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  return b;
}

/** Level label, Skip and hold progress while playing; the end message and Play again after. */
export function createGameHud(root: HTMLElement): GameHud {
  const label = document.createElement('span');
  const track = document.createElement('div');
  track.className = 'track';
  const fill = document.createElement('div');
  fill.className = 'fill';
  track.append(fill);
  const skip = button('Skip');
  const end = document.createElement('span');
  end.textContent = END_MESSAGE;
  const restart = button('Play again');
  root.replaceChildren(label, track, skip, end, restart);

  let lastLabel = '';
  let lastFill = '';
  let lastDone: boolean | null = null;

  return {
    show(visible) {
      root.hidden = !visible;
    },
    update(state) {
      if (state.done !== lastDone) {
        for (const el of [label, track, skip]) el.hidden = state.done;
        for (const el of [end, restart]) el.hidden = !state.done;
        lastDone = state.done;
      }
      const text = hudLabel(state.levelIndex, state.levelCount, state.levelName);
      if (text !== lastLabel) {
        label.textContent = text;
        lastLabel = text;
      }
      const width = `${Math.round(Math.min(1, Math.max(0, state.progress)) * 100)}%`;
      if (width !== lastFill) {
        fill.style.width = width;
        lastFill = width;
      }
    },
    onSkip(handler) {
      skip.addEventListener('click', handler);
    },
    onRestart(handler) {
      restart.addEventListener('click', handler);
    },
  };
}
