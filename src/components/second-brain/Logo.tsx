'use client';

// Braindot identity: an open ring with a single dot sitting on its edge.
// The ring is the vault, the dot is the note that connects to it — and the
// name is right there in the mark.

export function LogoMark({ size = 16, color = 'var(--acc)', dot = 'var(--acc2)' }: {
  size?: number; color?: string; dot?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%',
        border: `${Math.max(1.5, size * 0.135)}px solid ${color}`,
        position: 'relative', display: 'inline-block', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', right: -size * 0.13, bottom: -size * 0.13,
        width: size * 0.34, height: size * 0.34,
        borderRadius: '50%', background: dot,
      }} />
    </span>
  );
}

/** Mark + wordmark lock-up. */
export function LogoWordmark({ size = 14, color = 'var(--t1)' }: { size?: number; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <LogoMark size={size + 1} />
      <span style={{
        fontFamily: 'var(--font-code)',
        fontWeight: 700,
        fontSize: size,
        letterSpacing: '-0.2px',
        color,
      }}>
        braindot
      </span>
    </span>
  );
}
