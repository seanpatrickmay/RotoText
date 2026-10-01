import { vec3, type Vec3 } from './vec3';

export interface Point2 {
  x: number;
  y: number;
}

/** How the viewport sits on the physical screen. */
export interface ScreenFrame {
  mmPerPx: number;
  screenWidthPx: number;
  screenHeightPx: number;
  /** Viewport top-left on the physical screen, CSS px. */
  viewportOriginPx: Point2;
}

/** An element's untransformed box in viewport CSS px. */
export interface ElementLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ScreenRect {
  center: Vec3;
  widthMm: number;
  heightMm: number;
}

export interface ViewportEnv {
  screenWidthPx: number;
  screenHeightPx: number;
  isTouch: boolean;
  screenX: number;
  screenY: number;
  outerHeight: number;
  innerHeight: number;
  isFullscreen: boolean;
}

/** Status-bar height on Dynamic Island iPhones, CSS px. */
export const IPHONE_STATUS_BAR_PX = 59;

/**
 * The front camera faces the viewer, so the viewer's right is the image's left
 * and image-down is screen-down: both lateral axes flip.
 */
export function cameraToScreen(eyeCam: Vec3, cameraOffsetMm: Point2): Vec3 {
  return vec3(cameraOffsetMm.x - eyeCam.x, cameraOffsetMm.y - eyeCam.y, eyeCam.z);
}

export function estimateViewportOrigin(env: ViewportEnv, topOverridePx: number | null): Point2 {
  let origin: Point2;
  if (env.isFullscreen) origin = { x: 0, y: 0 };
  else if (env.isTouch) origin = { x: 0, y: IPHONE_STATUS_BAR_PX };
  else origin = { x: env.screenX, y: env.screenY + env.outerHeight - env.innerHeight };
  return topOverridePx === null ? origin : { x: origin.x, y: topOverridePx };
}

export function viewportToScreenMm(p: Point2, frame: ScreenFrame): Vec3 {
  const sx = frame.viewportOriginPx.x + p.x;
  const sy = frame.viewportOriginPx.y + p.y;
  return vec3((sx - frame.screenWidthPx / 2) * frame.mmPerPx, (frame.screenHeightPx / 2 - sy) * frame.mmPerPx, 0);
}

export function screenMmToViewport(p: Vec3, frame: ScreenFrame): Point2 {
  const sx = p.x / frame.mmPerPx + frame.screenWidthPx / 2;
  const sy = frame.screenHeightPx / 2 - p.y / frame.mmPerPx;
  return { x: sx - frame.viewportOriginPx.x, y: sy - frame.viewportOriginPx.y };
}

export function layoutToScreenRect(layout: ElementLayout, frame: ScreenFrame): ScreenRect {
  const center = viewportToScreenMm(
    { x: layout.left + layout.width / 2, y: layout.top + layout.height / 2 },
    frame,
  );
  return { center, widthMm: layout.width * frame.mmPerPx, heightMm: layout.height * frame.mmPerPx };
}
