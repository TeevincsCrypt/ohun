export type MicrophoneErrorReason = "permission-denied" | "unavailable" | "unsupported" | "unknown";

/** Error surfaced to the UI for anything that goes wrong capturing the microphone. */
export class MicrophoneError extends Error {
  reason: MicrophoneErrorReason;

  constructor(reason: MicrophoneErrorReason, message: string) {
    super(message);
    this.name = "MicrophoneError";
    this.reason = reason;
  }
}

/** Maps a getUserMedia() rejection to a MicrophoneError with a useful message. */
export function toMicrophoneError(error: unknown): MicrophoneError {
  if (error instanceof MicrophoneError) {
    return error;
  }

  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return new MicrophoneError(
        "permission-denied",
        "Microphone access was denied. Allow microphone access for this site in your browser settings and try again.",
      );
    }
    if (
      error.name === "NotFoundError" ||
      error.name === "NotReadableError" ||
      error.name === "OverconstrainedError"
    ) {
      return new MicrophoneError(
        "unavailable",
        "No usable microphone was found. Check that a microphone is connected and not in use by another app.",
      );
    }
  }

  return new MicrophoneError(
    "unknown",
    error instanceof Error ? error.message : "Could not access the microphone.",
  );
}
