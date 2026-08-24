/**
 * Abstract monochrome visual: two hands reaching toward each other with a
 * gap of soundwave arcs and floating language glyphs between the
 * fingertips — the "two people, two languages, one instant bridge" idea
 * from the brand brief, rendered as flat line-art rather than a
 * photographic composite (no image-generation pipeline in Phase 1).
 */
export function HandsBridge({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 480"
      className={`w-full h-auto text-[var(--foreground)] ${className}`}
      role="img"
      aria-label="Two hands reaching toward each other, with soundwaves and language characters bridging the gap between them"
    >
      <defs>
        <filter id="ohun-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <radialGradient id="ohun-human-palm" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.9" />
        </radialGradient>
      </defs>

      {/* ambient glow behind the gap */}
      <circle cx="400" cy="240" r="90" fill="currentColor" opacity="0.06" filter="url(#ohun-glow)" />

      {/* left hand — mechanical / capture side */}
      <g opacity="0.92">
        <line x1="20" y1="472" x2="150" y2="410" stroke="currentColor" strokeWidth="34" strokeLinecap="round" />
        <ellipse cx="150" cy="410" rx="62" ry="48" transform="rotate(-16 150 410)" fill="currentColor" />
        <line x1="195" y1="365" x2="300" y2="300" stroke="currentColor" strokeWidth="26" strokeLinecap="round" />
        <line x1="205" y1="345" x2="350" y2="260" stroke="currentColor" strokeWidth="24" strokeLinecap="round" />
        <line x1="215" y1="330" x2="378" y2="228" stroke="currentColor" strokeWidth="24" strokeLinecap="round" />
        <line x1="225" y1="340" x2="360" y2="248" stroke="currentColor" strokeWidth="22" strokeLinecap="round" />
        <line x1="235" y1="355" x2="330" y2="270" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />

        {/* circuit overlay */}
        <g stroke="var(--background)" strokeWidth="1.2" opacity="0.5" fill="none">
          <path d="M150,410 L247,332 L364,244 M247,332 L305,295 M305,295 L355,258" />
        </g>
        <g fill="var(--background)" opacity="0.7">
          <circle cx="150" cy="410" r="3.5" />
          <circle cx="247" cy="332" r="3" />
          <circle cx="305" cy="295" r="3" />
          <circle cx="355" cy="258" r="3" />
          <circle cx="364" cy="244" r="3" />
        </g>
      </g>

      {/* right hand — human / listening side */}
      <g opacity="0.92">
        <line x1="780" y1="472" x2="650" y2="410" stroke="currentColor" strokeWidth="34" strokeLinecap="round" />
        <ellipse cx="650" cy="410" rx="62" ry="48" transform="rotate(16 650 410)" fill="url(#ohun-human-palm)" />
        <line x1="605" y1="365" x2="500" y2="300" stroke="currentColor" strokeWidth="26" strokeLinecap="round" />
        <line x1="595" y1="345" x2="450" y2="260" stroke="currentColor" strokeWidth="24" strokeLinecap="round" />
        <line x1="585" y1="330" x2="422" y2="228" stroke="currentColor" strokeWidth="24" strokeLinecap="round" />
        <line x1="575" y1="340" x2="440" y2="248" stroke="currentColor" strokeWidth="22" strokeLinecap="round" />
        <line x1="565" y1="355" x2="470" y2="270" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
      </g>

      {/* soundwave arcs bridging the fingertip gap */}
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <circle cx="400" cy="238" r="18" opacity="0.55" strokeWidth="2" />
        <circle cx="400" cy="238" r="32" opacity="0.32" strokeWidth="2" />
        <circle cx="400" cy="238" r="47" opacity="0.16" strokeWidth="2" />
      </g>

      {/* floating language glyphs */}
      <g fill="currentColor" fontFamily="var(--font-sans), sans-serif" fontWeight="600">
        <text x="352" y="182" fontSize="20" opacity="0.5" transform="rotate(-8 352 182)">A</text>
        <text x="440" y="188" fontSize="18" opacity="0.45" transform="rotate(6 440 188)">文</text>
        <text x="358" y="292" fontSize="18" opacity="0.4" transform="rotate(-4 358 292)">Ọ</text>
        <text x="432" y="298" fontSize="18" opacity="0.5" transform="rotate(5 432 298)">É</text>
      </g>
    </svg>
  );
}
