export type CameraErrorReason = 'insecure' | 'unsupported' | 'denied' | 'unavailable';

export class CameraError extends Error {
  constructor(
    readonly reason: CameraErrorReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
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
      ? new CameraError('denied', 'Camera permission was denied.', { cause: err })
      : new CameraError('unavailable', 'No usable camera was found.', { cause: err });
  }

  video.muted = true;
  video.playsInline = true;
  try {
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    stopCamera(stream);
    video.srcObject = null;
    throw new CameraError('unavailable', 'The camera started but the video could not play.', { cause: err });
  }
  return stream;
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
