import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)]">
      <div className="mx-auto max-w-6xl px-6 py-16 text-center">
        <p className="text-sm font-medium text-[var(--muted)]">
          Trusted by teams and travelers worldwide
        </p>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-[var(--border)] px-6 py-8 text-sm text-[var(--muted)] sm:flex-row">
        <Logo />
        <p>&copy; {new Date().getFullYear()} OHUN. All rights reserved.</p>
      </div>
    </footer>
  );
}
