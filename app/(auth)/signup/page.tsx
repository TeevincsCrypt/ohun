"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signUp, type AuthFormState } from "../actions";
import { AuthShell, AuthField, AuthLink } from "../AuthShell";
import { Button, Pill } from "@/components/ui";
import { CALL_LANGUAGES, LANGUAGE_FLAG, type CallLanguageCode } from "@/types";

const initialState: AuthFormState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button size="lg" className="w-full" type="submit" disabled={pending}>
      {pending ? "Creating account…" : "Create account"}
    </Button>
  );
}

export default function SignUpPage() {
  const [state, formAction] = useActionState(signUp, initialState);

  return (
    <AuthShell
      title="Create your Ohun account"
      subtitle="Pick a username so people can find you, and the language you speak."
      footer={<>Already have an account? <AuthLink href="/login">Log in</AuthLink></>}
    >
      <form action={formAction} className="mt-10 flex flex-col gap-6">
        <AuthField id="displayName" label="Display name" placeholder="Marie Dupont" required autoComplete="name" />
        <AuthField
          id="username"
          label="Username"
          placeholder="marie"
          hint="Lowercase letters, numbers and underscores. 3–20 characters."
          required
          autoComplete="off"
          spellCheck={false}
        />
        <AuthField id="email" label="Email" type="email" placeholder="you@example.com" required autoComplete="email" />
        <AuthField
          id="password"
          label="Password"
          type="password"
          hint="At least 8 characters."
          required
          autoComplete="new-password"
        />

        <div className="flex flex-col gap-2">
          <label htmlFor="preferredLanguage" className="text-sm font-medium text-[var(--muted)]">
            Language you speak
          </label>
          <select
            id="preferredLanguage"
            name="preferredLanguage"
            defaultValue="en"
            className="h-12 w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--foreground)] outline-none transition-colors focus-visible:border-[var(--foreground)]"
          >
            {CALL_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {LANGUAGE_FLAG[language.code as CallLanguageCode]} {language.label} · {language.nativeLabel}
              </option>
            ))}
          </select>
        </div>

        {state.error && (
          <Pill tone="error" className="w-full justify-center text-center">
            {state.error}
          </Pill>
        )}

        <SubmitButton />
      </form>
    </AuthShell>
  );
}
