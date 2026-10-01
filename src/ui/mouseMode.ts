import { viewportToScreenMm, type Point2, type ScreenFrame } from '../geometry/screenSpace';
import { vec3, type Vec3 } from '../geometry/vec3';

export const MOUSE_GAIN = 3;
export const MIN_MOUSE_DISTANCE_MM = 150;
export const MAX_MOUSE_DISTANCE_MM = 1500;
export const DEFAULT_MOUSE_DISTANCE_MM = 500;

export const clampDistance = (mm: number): number =>
  Math.min(MAX_MOUSE_DISTANCE_MM, Math.max(MIN_MOUSE_DISTANCE_MM, mm));

export function pointerToEye(
  pointer: Point2,
  viewport: { width: number; height: number },
  distanceMm: number,
  frame: ScreenFrame,
): Vec3 {
  const centre = viewportToScreenMm({ x: viewport.width / 2, y: viewport.height / 2 }, frame);
  const p = viewportToScreenMm(pointer, frame);
  return vec3(
    centre.x + (p.x - centre.x) * MOUSE_GAIN,
    centre.y + (p.y - centre.y) * MOUSE_GAIN,
    clampDistance(distanceMm),
  );
}

export interface MouseModeHandle {
  /** Re-emit the current eye, e.g. after the frame changed. */
  refresh(): void;
  detach(): void;
}

/** Events inside the debug panel or camera inset must not steer the eye. */
const inPanel = (t: EventTarget | null): boolean => t instanceof Element && t.closest('#debug, #inset') !== null;

/** Pointer/finger position stands in for the eye; wheel or pinch changes distance. */
export function attachMouseMode(getFrame: () => ScreenFrame, onEye: (eye: Vec3) => void): MouseModeHandle {
  let pointer: Point2 = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let distance = DEFAULT_MOUSE_DISTANCE_MM;
  let pinchStart: { gap: number; distance: number } | null = null;
  let activeTouches = 0;

  const emit = () =>
    onEye(pointerToEye(pointer, { width: window.innerWidth, height: window.innerHeight }, distance, getFrame()));

  const onPointerMove = (e: PointerEvent) => {
    if (!e.isPrimary || activeTouches >= 2 || inPanel(e.target)) return;
    pointer = { x: e.clientX, y: e.clientY };
    emit();
  };
  const onWheel = (e: WheelEvent) => {
    if (inPanel(e.target)) return;
    e.preventDefault();
    distance = clampDistance(distance + e.deltaY);
    emit();
  };
  const onTouchMove = (e: TouchEvent) => {
    if (inPanel(e.target)) return;
    if (e.touches.length !== 2) {
      pinchStart = null;
      return;
    }
    const a = e.touches[0]!;
    const b = e.touches[1]!;
    const gap = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!(gap > 0)) return;
    if (!pinchStart) pinchStart = { gap, distance };
    else {
      // Spreading fingers brings the virtual eye closer.
      distance = clampDistance((pinchStart.distance * pinchStart.gap) / gap);
      emit();
    }
  };
  const onTouchStart = (e: TouchEvent) => {
    activeTouches = e.touches.length;
  };
  const onTouchEnd = (e: TouchEvent) => {
    activeTouches = e.touches.length;
    pinchStart = null;
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchend', onTouchEnd);
  window.addEventListener('touchcancel', onTouchEnd);
  emit();

  return {
    refresh: emit,
    detach() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    },
  };
}
