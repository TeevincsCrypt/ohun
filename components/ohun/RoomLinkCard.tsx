"use client";

import { useState, useTransition } from "react";
import { regenerateRoomLink } from "@/lib/room/actions";
import { Button, Card, Pill } from "@/components/ui";

/**
 * The shareable room link, for a bio or a signature. Anyone who opens it
 * can ring this account without an OHUN account of their own.
 */
export function RoomLinkCard({
  slug: initialSlug,
  origin,
}: {
  slug: string;
  /** Resolved server-side, so the rendered URL is absolute on first paint. */
  origin: string;
}) {
  const [slug, setSlug] = useState(initialSlug);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startAction] = useTransition();

  const url = `${origin}/r/${slug}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the link and copy it manually.");
    }
  };

  const regenerate = () =>
    startAction(async () => {
      setError(null);
      const result = await regenerateRoomLink();
      if (result.error || !result.slug) {
        setError(result.error ?? "Could not generate a new link.");
        return;
      }
      setSlug(result.slug);
      setCopied(false);
    });

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Your room link
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Put this in your bio. Anyone who opens it can call you — no account needed on their side.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-[var(--foreground)]">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--background)]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {error && (
        <Pill tone="error" className="w-full justify-center text-center">
          {error}
        </Pill>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="md"
          href={`https://x.com/intent/post?text=${encodeURIComponent(
            `Talk to me in your own language — OHUN translates live.\n${url}`,
          )}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Share on X
        </Button>

        <button
          type="button"
          onClick={regenerate}
          disabled={pending}
          className="text-sm font-medium text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--foreground)] disabled:opacity-60"
        >
          {pending ? "Generating…" : "Generate a new link"}
        </button>
      </div>

      <p className="text-xs text-[var(--muted)]">
        Generating a new link immediately stops the old one from working.
      </p>
    </Card>
  );
}
