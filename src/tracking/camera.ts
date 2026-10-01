export type CameraErrorReason = 'insecure' | 'unsupported' | 'denied' | 'unavailable';

export class CameraError extends Error {
  constructor(
    readonly reason: CameraErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('insecure', 'The camera needs HTTPS (or localhost).');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported', 'This browser has no camera API.');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (err) {
    const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    throw denied
      ? new CameraError('denied', 'Camera permission was denied.')
      : new CameraError('unavailable', 'No usable camera was found.');
  }

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
