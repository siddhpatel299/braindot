'use client';

// Braindot identity — the terminal block cursor.
// The mark is the thing that blinks when it's your turn to think, which is
// the honest subject of a monospace writing app. It's a solid shape, so it
// stays legible down to favicon size.

export function LogoMark({ size = 32, color = 'var(--acc)' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect x="9.5" y="6.5" width="13" height="19" rx="2.2" fill={color} />
    </svg>
  );
}

/**
 * The wordmark lock-up: "braindot" followed by a blinking block cursor.
 * The cursor IS the logo, so it sits after the name the way it would in the
 * editor. Blink respects prefers-reduced-motion (see globals.css).
 */
export function LogoWordmark({
  size = 17,
  color = 'var(--t1)',
  blink = true,
}: {
  size?: number;
  color?: string;
  blink?: boolean;
}) {
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
        fontWeight: 700,
        fontSize: size,
        letterSpacing: '-0.02em',
        color,
        display: 'inline-flex',
        alignItems: 'baseline',
        userSelect: 'none',
      }}
    >
      braindot
      <span className={blink ? 'sb-caret sb-caret-blink' : 'sb-caret'} />
    </span>
  );
}
