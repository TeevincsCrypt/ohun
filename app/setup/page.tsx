"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LanguageSelect } from "@/components/ui";
import { Logo } from "@/components/ohun";
import type { LanguageCode } from "@/types";

export default function SetupPage() {
  const router = useRouter();
  const [yourLanguage, setYourLanguage] = useState<LanguageCode>("en");
  const [theirLanguage, setTheirLanguage] = useState<LanguageCode>("fr");

  function handleStart() {
    const params = new URLSearchParams({ you: yourLanguage, them: theirLanguage });
    router.push(`/conversation?${params.toString()}`);
  }

  return (
    <div className="theme-dark flex flex-1 flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="px-6 py-6">
        <Logo />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Set up your conversation
          </h1>
          <p className="mt-3 text-[var(--muted)]">
            Choose the language each person will speak. OHUN will translate
            between them.
          </p>

          <div className="mt-10 flex flex-col gap-6">
            <LanguageSelect
              id="your-language"
              label="Your language"
              value={yourLanguage}
              onChange={setYourLanguage}
            />
            <LanguageSelect
              id="their-language"
              label="Their language"
              value={theirLanguage}
              onChange={setTheirLanguage}
            />
          </div>

          <div className="mt-10">
            <Button size="lg" className="w-full" onClick={handleStart}>
              Start conversation
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
