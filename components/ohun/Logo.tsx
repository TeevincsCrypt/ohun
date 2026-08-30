import Link from "next/link";
import { LogoMark } from "./LogoMark";

export function Logo({ mark = false }: { mark?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-[var(--foreground)] transition-opacity hover:opacity-85"
    >
      <LogoMark size={26} id="logo" />
      <span>
        OHUN
        {mark && <sup className="ml-0.5 text-[0.5em] font-medium">®</sup>}
      </span>
    </Link>
  );
}
