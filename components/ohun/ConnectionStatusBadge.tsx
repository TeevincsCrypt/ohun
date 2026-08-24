import type { ConnectionState } from "@/types";
import { Pill } from "@/components/ui";

const copy: Record<ConnectionState, string> = {
  disconnected: "Not connected",
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
  error: "Connection error",
};

const tone: Record<ConnectionState, "neutral" | "live" | "warning" | "error" | "muted"> = {
  disconnected: "muted",
  connecting: "warning",
  connected: "live",
  reconnecting: "warning",
  error: "error",
};

export function ConnectionStatusBadge({ state }: { state: ConnectionState }) {
  return (
    <Pill tone={tone[state]}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          state === "connected" ? "bg-emerald-500" : "bg-current opacity-60"
        }`}
      />
      {copy[state]}
    </Pill>
  );
}
