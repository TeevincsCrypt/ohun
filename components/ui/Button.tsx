import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";

type Variant = "solid" | "outline" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]";

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-6 text-base",
};

const variants: Record<Variant, string> = {
  // Text on the accent fill is a token, not a fixed colour: the dark theme
  // fills with bright lime and needs near-black on it, the light theme
  // fills with a deep green and needs white. Both directions fail if this
  // is pinned either way.
  solid:
    "bg-[var(--accent)] text-[var(--accent-on)] shadow-[0_6px_24px_-8px_var(--accent-glow)] hover:bg-[var(--accent-strong)]",
  outline:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-raised)] hover:border-[var(--accent-border)]",
  ghost: "text-[var(--muted)] hover:text-[var(--foreground)]",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = CommonProps &
  ComponentPropsWithoutRef<"button"> & { href?: undefined };

type ButtonAsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, "className"> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button({
  variant = "solid",
  size = "md",
  icon,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const classes = `${base} ${sizes[size]} ${variants[variant]} ${className}`;

  if ("href" in rest && rest.href !== undefined) {
    const { href, ...linkProps } = rest as Omit<ButtonAsLink, keyof CommonProps>;
    return (
      <Link href={href} className={classes} {...linkProps}>
        {children}
        {icon}
      </Link>
    );
  }

  const buttonProps = rest as Omit<ButtonAsButton, keyof CommonProps>;
  return (
    <button className={classes} {...buttonProps}>
      {children}
      {icon}
    </button>
  );
}
