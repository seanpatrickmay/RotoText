export type SceneName = 'targets' | 'text' | 'game';

export interface SceneSwitch {
  set(scene: SceneName): void;
  onChange(handler: (scene: SceneName) => void): void;
}

const LABELS: Record<SceneName, string> = { targets: 'Targets', text: 'Text', game: 'Line of Sight' };

/** A segmented scene control, prepended to `root`. */
export function createSceneSwitch(root: HTMLElement, initial: SceneName): SceneSwitch {
  let handler: ((scene: SceneName) => void) | null = null;
  const buttons = (Object.keys(LABELS) as SceneName[]).map((name) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = LABELS[name];
    button.dataset.scene = name;
    // A mouse click must not leave focus here, or Space would re-click it.
    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', () => {
      show(name);
      handler?.(name);
    });
    return button;
  });
  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Scene');
  group.append(...buttons);
  root.prepend(group);

  function show(scene: SceneName): void {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.scene === scene));
  }

  show(initial);
  return {
    set: show,
    onChange(next) {
      handler = next;
    },
  };
}
