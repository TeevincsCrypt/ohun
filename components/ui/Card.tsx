import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`card-lit rounded-2xl p-6 ${className}`}
    >
      {children}
    </div>
  );
}
