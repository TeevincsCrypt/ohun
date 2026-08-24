import Link from "next/link";

export function Logo({ mark = false }: { mark?: boolean }) {
  return (
    <Link
      href="/"
      className="text-lg font-bold tracking-tight text-[var(--foreground)]"
    >
      OHUN
      {mark && <sup className="ml-0.5 text-[0.5em] font-medium">®</sup>}
    </Link>
  );
}
