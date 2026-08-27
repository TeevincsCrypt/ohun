"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { updateAvatar, updateProfile, removeAvatar, type ProfileFormState } from "@/lib/profile/actions";
import { getBillingStatus } from "@/lib/billing/actions";
import { Avatar } from "@/components/ohun/UserResult";
import { UpgradeDialog } from "@/components/ohun/UpgradeDialog";
import { Button, Card, Pill } from "@/components/ui";
import { AVATAR_MAX_BYTES, CALL_LANGUAGES, LANGUAGE_FLAG, type BillingStatus, type Profile } from "@/types";

const initialState: ProfileFormState = { error: null };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

function Notice({ state }: { state: ProfileFormState }) {
  if (state.error) {
    return (
      <Pill tone="error" className="w-full justify-center text-center">
        {state.error}
      </Pill>
    );
  }
  if (state.info) {
    return (
      <Pill tone="live" className="w-full justify-center text-center">
        {state.info}
      </Pill>
    );
  }
  return null;
}

function Field({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-[var(--muted)]">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus-visible:border-[var(--foreground)]"
        {...props}
      />
      {hint && <p className="text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function AvatarSection({ profile }: { profile: Profile }) {
  const [state, formAction] = useActionState(updateAvatar, initialState);
  const [removeState, setRemoveState] = useState<ProfileFormState>(initialState);
  const [removing, startRemoving] = useTransition();
  const formRef = useRef<HTMLFormElement | null>(null);
  // Shows the chosen image immediately, before the upload round-trips.
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Photo</p>

      <div className="flex items-center gap-5">
        <Avatar name={profile.displayName} src={preview ?? profile.avatarUrl} size="lg" />

        <form ref={formRef} action={formAction} className="flex flex-col gap-2">
          <input
            type="file"
            name="avatar"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setPreview(URL.createObjectURL(file));
              // Upload on selection — a separate "upload" click is a step
              // nobody expects from a photo picker.
              formRef.current?.requestSubmit();
            }}
            className="text-sm text-[var(--muted)] file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--foreground)]"
          />
          <p className="text-xs text-[var(--muted)]">
            JPEG, PNG or WebP · up to {Math.round(AVATAR_MAX_BYTES / 1024 / 1024)}MB
          </p>
        </form>
      </div>

      {profile.avatarUrl && (
        <button
          type="button"
          disabled={removing}
          onClick={() =>
            startRemoving(async () => {
              setPreview(null);
              setRemoveState(await removeAvatar());
            })
          }
          className="self-start text-sm font-medium text-red-400 underline underline-offset-4 disabled:opacity-60"
        >
          {removing ? "Removing…" : "Remove photo"}
        </button>
      )}

      <Notice state={state.error || state.info ? state : removeState} />
    </Card>
  );
}

function DetailsSection({ profile }: { profile: Profile }) {
  const [state, formAction] = useActionState(updateProfile, initialState);

  return (
    <Card>
      <form action={formAction} className="flex flex-col gap-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Details</p>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--muted)]">Username</span>
          <div className="flex h-12 items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-base text-[var(--muted)]">
            @{profile.username}
          </div>
          <p className="text-xs text-[var(--muted)]">Usernames can&apos;t be changed.</p>
        </div>

        <Field
          id="displayName"
          label="Display name"
          defaultValue={profile.displayName}
          maxLength={50}
          required
        />

        <Field
          id="phone"
          label="Phone number"
          type="tel"
          inputMode="tel"
          defaultValue={profile.phone ?? ""}
          placeholder="+2348012345678"
          hint="Optional. Include your country code."
        />

        <div className="flex flex-col gap-2">
          <label htmlFor="preferredLanguage" className="text-sm font-medium text-[var(--muted)]">
            Language you speak
          </label>
          <select
            id="preferredLanguage"
            name="preferredLanguage"
            defaultValue={profile.preferredLanguage}
            className="h-12 w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--foreground)] outline-none transition-colors focus-visible:border-[var(--foreground)]"
          >
            {CALL_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {LANGUAGE_FLAG[language.code as keyof typeof LANGUAGE_FLAG]} {language.label} ·{" "}
                {language.nativeLabel}
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--muted)]">
            Calls you join are translated into this language.
          </p>
        </div>

        <Notice state={state} />
        <SaveButton />
      </form>
    </Card>
  );
}

function PlanSection() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    void getBillingStatus().then(setBilling);
  }, [showUpgrade]);

  if (!billing) return null;

  const isFree = billing.status === "free";

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Plan</p>
          <p className="mt-2 text-xl font-bold tracking-tight">
            {isFree ? "Free" : "Subscribed"}
          </p>
        </div>
        <Pill tone={isFree ? "neutral" : "live"}>{isFree ? "Free plan" : "Active"}</Pill>
      </div>

      {isFree && (
        <>
          <p className="text-sm text-[var(--muted)]">
            {billing.freeCallsRemaining} of {billing.freeCallsLimit} calls left this month.
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface)]">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{
                width: `${(billing.freeCallsUsed / billing.freeCallsLimit) * 100}%`,
              }}
            />
          </div>
          <Button size="md" className="self-start" onClick={() => setShowUpgrade(true)}>
            Subscribe
          </Button>
        </>
      )}

      {!isFree && (
        <p className="text-sm text-[var(--muted)]">Unlimited calls — thanks for subscribing.</p>
      )}

      {showUpgrade && <UpgradeDialog onClose={() => setShowUpgrade(false)} />}
    </Card>
  );
}

export function ProfileClient({ profile }: { profile: Profile }) {
  return (
    <div className="flex flex-col gap-6">
      <PlanSection />
      <AvatarSection profile={profile} />
      <DetailsSection profile={profile} />
    </div>
  );
}
