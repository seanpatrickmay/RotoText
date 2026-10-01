// Copies MediaPipe's WASM runtime into public/ and downloads the face model once.
import { access, copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = 'public/mediapipe';
const WASM_SRC = 'node_modules/@mediapipe/tasks-vision/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MODEL_PATH = join(OUT_DIR, 'face_landmarker.task');

const exists = (path) => access(path).then(() => true, () => false);

await mkdir(join(OUT_DIR, 'wasm'), { recursive: true });
for (const file of await readdir(WASM_SRC)) {
  await copyFile(join(WASM_SRC, file), join(OUT_DIR, 'wasm', file));
}

if (!(await exists(MODEL_PATH))) {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status}`);
  await writeFile(MODEL_PATH, Buffer.from(await res.arrayBuffer()));
  console.log(`Downloaded ${MODEL_PATH}`);
}
console.log(`MediaPipe assets ready in ${OUT_DIR}`);
