export type TranscriptionErrorReason = "auth" | "connection" | "server-config" | "unknown";

/** Error surfaced to the UI for anything that goes wrong talking to AssemblyAI. */
export class TranscriptionError extends Error {
  reason: TranscriptionErrorReason;

  constructor(reason: TranscriptionErrorReason, message: string) {
    super(message);
    this.name = "TranscriptionError";
    this.reason = reason;
  }
}
