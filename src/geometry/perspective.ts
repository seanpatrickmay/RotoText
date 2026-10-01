import { MIN_DEPTH_RATIO, MIN_EYE_Z_MM, projectToScreenPlane } from './projection';
import { screenMmToViewport, type Point2, type ScreenFrame } from './screenSpace';
import { vec3, type Vec3 } from './vec3';

const isFiniteVec = (v: Vec3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/**
 * Where the ray from the eye through world point `q` meets the screen plane, in
 * viewport px. Null when the point is at, behind, or too close to the eye's depth.
 */
export function projectPoint(eye: Vec3, q: Vec3, frame: ScreenFrame): Point2 | null {
  if (!isFiniteVec(eye) || !isFiniteVec(q)) return null;
  const e = vec3(eye.x, eye.y, Math.max(eye.z, MIN_EYE_Z_MM));
  if (e.z - q.z < MIN_DEPTH_RATIO * e.z) return null;
  return screenMmToViewport(projectToScreenPlane(e, q), frame);
}
