import type { ElementLayout, ViewportEnv } from '../geometry/screenSpace';

export interface DemoElements {
  corrected: HTMLElement;
  correctedBox: HTMLElement;
  followToggle: HTMLButtonElement;
  banner: HTMLElement;
  inset: HTMLElement;
  debugBody: HTMLElement;
  topbar: HTMLElement;
  scene: SVGSVGElement;
  game: SVGSVGElement;
  gameHud: HTMLElement;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

export function getDemoElements(): DemoElements {
  const scene = document.getElementById('scene');
  if (!(scene instanceof SVGSVGElement)) throw new Error('Missing #scene');
  const game = document.getElementById('game');
  if (!(game instanceof SVGSVGElement)) throw new Error('Missing #game');
  return {
    corrected: byId('corrected'),
    correctedBox: byId('corrected-box'),
    followToggle: byId('follow-toggle') as HTMLButtonElement,
    banner: byId('banner'),
    inset: byId('inset'),
    debugBody: byId('debug-body'),
    topbar: byId('topbar'),
    scene,
    game,
    gameHud: byId('game-hud'),
  };
}

/** Measure the untransformed wrapper, never the transformed headline. */
export function measureLayout(box: HTMLElement): ElementLayout {
  const r = box.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function setFollowState(els: DemoElements, following: boolean): void {
  els.followToggle.textContent = following ? 'Following you' : 'Static';
  els.followToggle.setAttribute('aria-pressed', String(following));
}

export function showBanner(els: DemoElements, message: string): void {
  els.banner.textContent = message;
  els.banner.hidden = false;
}

export function hideBanner(els: DemoElements): void {
  els.banner.hidden = true;
}

export function readViewportEnv(): ViewportEnv {
  return {
    screenWidthPx: window.screen.width,
    screenHeightPx: window.screen.height,
    isTouch: navigator.maxTouchPoints > 0,
    screenX: window.screenX,
    screenY: window.screenY,
    outerHeight: window.outerHeight,
    innerHeight: window.innerHeight,
    isFullscreen: document.fullscreenElement != null,
  };
}
