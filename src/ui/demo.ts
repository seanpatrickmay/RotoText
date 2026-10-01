import type { ElementLayout, ViewportEnv } from '../geometry/screenSpace';

export interface DemoElements {
  corrected: HTMLElement;
  correctedBox: HTMLElement;
  correctionState: HTMLElement;
  banner: HTMLElement;
  inset: HTMLElement;
  debugBody: HTMLElement;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

export function getDemoElements(): DemoElements {
  return {
    corrected: byId('corrected'),
    correctedBox: byId('corrected-box'),
    correctionState: byId('correction-state'),
    banner: byId('banner'),
    inset: byId('inset'),
    debugBody: byId('debug-body'),
  };
}

/** Measure the untransformed wrapper, never the transformed headline. */
export function measureLayout(box: HTMLElement): ElementLayout {
  const r = box.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function setCorrectionState(els: DemoElements, on: boolean): void {
  els.correctionState.textContent = on ? 'ON' : 'OFF';
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
