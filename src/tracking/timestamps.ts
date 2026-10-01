/** MediaPipe's video mode rejects timestamps that do not strictly increase. */
export function nextDetectorTimestamp(previousMs: number | null, nowMs: number): number {
  if (previousMs === null) return nowMs;
  return nowMs > previousMs ? nowMs : previousMs + 1;
}
