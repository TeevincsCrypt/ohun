/**
 * The OHUN mark: two arcs of a ring with their gaps set opposite one
 * another, so the pair reads as a single band twisting through itself
 * rather than as two C shapes stacked.
 *
 * Drawn rather than served as an image so it stays crisp at any size, needs
 * no network request, and can take its colour from the surface it sits on —
 * the same file is the favicon, the header mark and the loading state.
 *
 * Gradient ids are suffixed per instance: two marks on one page with the
 * same id would both resolve to whichever was defined first.
 */
export function LogoMark({
  size = 26,
  className = "",
  id = "ohun",
}: {
  size?: number;
  className?: string;
  /** Must be unique per rendered instance — see above. */
  id?: string;
}) {
  const outer = `${id}-outer`;
  const inner = `${id}-inner`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="OHUN"
      className={className}
    >
      <defs>
        <linearGradient id={outer} x1="4" y1="6" x2="28" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--accent-strong, #bef264)" />
          <stop offset="55%" stopColor="var(--accent, #a3e635)" />
          <stop offset="100%" stopColor="var(--accent, #a3e635)" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id={inner} x1="26" y1="10" x2="8" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--accent, #a3e635)" />
          <stop offset="100%" stopColor="var(--accent-strong, #bef264)" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      <path
        d="M 24.656 23.263 A 11.3 11.3 0 1 1 25.786 10.35"
        stroke={`url(#${outer})`}
        strokeWidth="4.4"
        strokeLinecap="round"
      />
      <path
        d="M 11.251 12.015 A 6.2 6.2 0 1 1 10.631 19.1"
        stroke={`url(#${inner})`}
        strokeWidth="3.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
