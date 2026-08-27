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
    <div className="theme-dark relative flex flex-1 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div
        aria-hidden
        className="glow-field left-1/2 top-[-160px] h-[420px] w-[680px] -translate-x-1/2 opacity-40"
        style={{ background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 68%)" }}
      />

      <header className="relative z-10 px-6 py-6">
        <Logo />
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="animate-rise w-full max-w-md">
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
        className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus-visible:border-[var(--accent)]"
        {...props}
      />
      {hint && <p className="text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium text-[var(--accent)] underline underline-offset-4 transition-opacity hover:opacity-80"
    >
      {children}
    </Link>
  );
}
