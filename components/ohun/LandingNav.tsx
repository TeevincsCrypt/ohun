import Link from "next/link";
import { Logo } from "./Logo";
import { Button } from "@/components/ui";

const links = [
  { href: "#product", label: "Product" },
  { href: "#languages", label: "Languages" },
  { href: "#pricing", label: "Pricing" },
  { href: "#insights", label: "Insights" },
];

export function LandingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md">
      <nav className="mx-auto flex h-18 max-w-6xl items-center justify-between px-6 py-4">
        <Logo mark />
        <ul className="hidden items-center gap-8 text-sm font-medium text-[var(--muted)] md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="transition-colors hover:text-[var(--foreground)]">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-5">
          <Link
            href="#"
            className="hidden text-sm font-medium text-[var(--foreground)]/80 transition-colors hover:text-[var(--foreground)] sm:inline"
          >
            Login
          </Link>
          <Button href="/setup" size="md">
            Start Free
          </Button>
        </div>
      </nav>
    </header>
  );
}
