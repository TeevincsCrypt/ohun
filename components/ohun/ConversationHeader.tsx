import { Logo } from "./Logo";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge";
import { Button } from "@/components/ui";
import type { ConnectionState } from "@/types";

export function ConversationHeader({
  connectionState,
}: {
  connectionState: ConnectionState;
}) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
      <div className="flex items-center gap-4">
        <Logo />
        <ConnectionStatusBadge state={connectionState} />
      </div>
      <Button href="/" variant="outline" size="md">
        End conversation
      </Button>
    </header>
  );
}
