import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ohun";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="theme-dark flex flex-1 flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="px-6 py-6">
        <Logo />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-[var(--muted)]">{subtitle}</p>
          {children}
          <p className="mt-8 text-center text-sm text-[var(--muted)]">{footer}</p>
        </div>
      </main>
    </div>
  );
}

export function AuthField({
  id,
  label,
  hint,
  ...props
}: {
  id: string;
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
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

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-[var(--foreground)] underline underline-offset-4">
      {children}
    </Link>
  );
}
