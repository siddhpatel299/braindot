'use client';

import { Monitor } from 'lucide-react';

interface DeskOnlyProps {
  /** What they were reaching for, named as the app names it. */
  title: string;
  /** Why it is not here — specific to the view, never a generic apology. */
  reason: string;
  onBack: () => void;
}

/**
 * The graph and the canvas are spatial tools: they want a pointer, two hands
 * and a lot of glass. Shrinking them onto a phone would produce something that
 * technically renders and is useless to actually think in, so they say so
 * plainly and point back to what does work here.
 */
export function DeskOnly({ title, reason, onBack }: DeskOnlyProps) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '32px 30px',
        background: 'var(--bg)',
        textAlign: 'center',
      }}
    >
      <Monitor size={26} strokeWidth={1.5} style={{ color: 'var(--t3)' }} />
      <div style={{ fontSize: 14, color: 'var(--t1)', letterSpacing: '0.01em' }}>{title} wants a bigger screen</div>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: 'var(--t3)', maxWidth: '34ch' }}>{reason}</p>
      <button
        onClick={onBack}
        style={{
          marginTop: 4,
          minHeight: 44,
          padding: '0 20px',
          borderRadius: 6,
          background: 'var(--bg2)',
          border: '1px solid var(--bd2)',
          color: 'var(--t1)',
          fontFamily: 'inherit',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        back to dashboard
      </button>
    </div>
  );
}
