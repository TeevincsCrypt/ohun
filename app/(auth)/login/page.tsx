"use client";

import { Suspense } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { signIn, type AuthFormState } from "../actions";
import { AuthShell, AuthField, AuthLink } from "../AuthShell";
import { Button, Pill } from "@/components/ui";

const initialState: AuthFormState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button size="lg" className="w-full" type="submit" disabled={pending}>
      {pending ? "Logging in…" : "Log in"}
    </Button>
  );
}

function LoginForm() {
  const [state, formAction] = useActionState(signIn, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/people";

  return (
    <form action={formAction} className="mt-10 flex flex-col gap-6">
      <input type="hidden" name="next" value={next} />
      <AuthField id="email" label="Email" type="email" placeholder="you@example.com" required autoComplete="email" />
      <AuthField id="password" label="Password" type="password" required autoComplete="current-password" />

      {state.error && (
        <Pill tone="error" className="w-full justify-center text-center">
          {state.error}
        </Pill>
      )}

      <SubmitButton />
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Log in to Ohun"
      subtitle="Speak freely. Understand instantly."
      footer={<>New here? <AuthLink href="/signup">Create an account</AuthLink></>}
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
