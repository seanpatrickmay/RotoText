import type { Landmark2D } from '../tracking/eyeEstimator';
import type { TargetStatus } from '../tracking/targetController';

export type Mode = 'camera' | 'mouse';

export interface InsetInfo {
  mode: Mode;
  status: TargetStatus | null;
  distanceMm: number;
  angleDeg: number;
  fps: number | null;
  delegate: string | null;
  presetLabel: string;
  /** Normalised iris midpoint in the raw camera frame. */
  eyePoint: Landmark2D | null;
}

export interface Inset {
  readonly video: HTMLVideoElement;
  update(info: InsetInfo): void;
  /** Disable the mode button and show a progress label while the camera starts. */
  setModeButtonBusy(busy: boolean): void;
  onModeButton(handler: () => void): void;
  onFullscreenButton(handler: () => void): void;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

export function createInset(root: HTMLElement): Inset {
  const feed = make('div', 'feed');
  const video = make('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  const canvas = make('canvas');
  feed.append(video, canvas);
  const readout = make('pre');
  const modeButton = make('button');
  const fullscreenButton = make('button');
  fullscreenButton.textContent = 'Fullscreen';
  fullscreenButton.hidden = !document.fullscreenEnabled;
  // A mouse click must not leave focus on a button, or Space would re-click it.
  for (const button of [modeButton, fullscreenButton]) {
    button.addEventListener('mousedown', (e) => e.preventDefault());
  }
  root.replaceChildren(feed, readout, modeButton, fullscreenButton);
  let busy = false;
  let modeLabel = '';
  const showModeLabel = () => {
    modeButton.textContent = busy ? 'Starting camera…' : modeLabel;
  };

  const ctx = canvas.getContext('2d');

  return {
    video,
    update(info) {
      feed.hidden = info.mode !== 'camera';
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        feed.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
      }
      if (ctx && !feed.hidden) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        if (info.eyePoint) {
          ctx.fillStyle = '#ffb547';
          ctx.beginPath();
          ctx.arc(info.eyePoint.x * canvas.width, info.eyePoint.y * canvas.height, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      readout.textContent = [
        `mode     ${info.mode}`,
        `status   ${info.status ?? '-'}`,
        `angle    ${info.angleDeg.toFixed(1)}°`,
        `distance ${(info.distanceMm / 10).toFixed(1)} cm`,
        `fps      ${info.fps === null ? '-' : info.fps.toFixed(0)}`,
        `delegate ${info.delegate ?? '-'}`,
        `device   ${info.presetLabel}`,
      ].join('\n');
      modeLabel = info.mode === 'camera' ? 'Mouse mode' : 'Camera mode';
      showModeLabel();
    },
    setModeButtonBusy(next) {
      busy = next;
      modeButton.disabled = next;
      showModeLabel();
    },
    onModeButton(handler) {
      modeButton.addEventListener('click', handler);
    },
    onFullscreenButton(handler) {
      fullscreenButton.addEventListener('click', handler);
    },
  };
}
