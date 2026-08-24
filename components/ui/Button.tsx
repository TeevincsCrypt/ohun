import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";

type Variant = "solid" | "outline" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]";

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-6 text-base",
};

const variants: Record<Variant, string> = {
  solid: "bg-[var(--foreground)] text-[var(--background)] hover:opacity-85",
  outline: "border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface)]",
  ghost: "text-[var(--foreground)]/70 hover:text-[var(--foreground)]",
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
