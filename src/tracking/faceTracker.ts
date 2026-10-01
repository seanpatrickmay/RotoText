import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { largestFace } from './eyeEstimator';
import { nextDetectorTimestamp } from './timestamps';

export type Delegate = 'GPU' | 'CPU';

export interface FaceTracker {
  readonly delegate: Delegate;
  /** Landmarks of the largest face in the current frame, or null. */
  detect(video: HTMLVideoElement, nowMs: number): readonly NormalizedLandmark[] | null;
  close(): void;
}

const ASSET_BASE = `${import.meta.env.BASE_URL}mediapipe`;

export async function createFaceTracker(preferred: Delegate = 'GPU'): Promise<FaceTracker> {
  const fileset = await FilesetResolver.forVisionTasks(`${ASSET_BASE}/wasm`);
  const create = (delegate: Delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${ASSET_BASE}/face_landmarker.task`, delegate },
      runningMode: 'VIDEO',
      numFaces: 3,
    });

  let delegate: Delegate = preferred;
  let landmarker: FaceLandmarker;
  if (preferred === 'CPU') {
    landmarker = await create('CPU');
  } else {
    try {
      landmarker = await create('GPU');
    } catch (err) {
      console.warn('GPU delegate failed; falling back to CPU.', err);
      delegate = 'CPU';
      landmarker = await create('CPU');
    }
  }

  let lastTimestamp: number | null = null;
  return {
    delegate,
    detect(video, nowMs) {
      lastTimestamp = nextDetectorTimestamp(lastTimestamp, nowMs);
      return largestFace(landmarker.detectForVideo(video, lastTimestamp).faceLandmarks);
    },
    close() {
      landmarker.close();
    },
  };
}
