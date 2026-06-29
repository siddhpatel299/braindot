'use client';

import { Check, Link2, AlignLeft, Sparkles } from 'lucide-react';

interface StatusBarProps {
  wordCount: number;
  linkCount: number;
  dirty: boolean;
  totalNotes: number;
  totalConnections: number;
}

export function StatusBar({
  wordCount,
  linkCount,
  dirty,
  totalNotes,
  totalConnections,
}: StatusBarProps) {
  return (
    <div
      style={{
        height: 24,
        background: 'var(--bg1)',
        borderTop: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 10,
        fontFamily: 'inherit',
        color: 'var(--t3)',
        flexShrink: 0,
      }}
    >
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: dirty ? 'var(--amb)' : 'var(--grn)' }}>
          <Check size={10} strokeWidth={2.5} />
          {dirty ? 'unsaved' : 'autosaved'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Link2 size={10} strokeWidth={2} />
          {linkCount} links
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlignLeft size={10} strokeWidth={2} />
          {wordCount} words
        </span>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--acc2)' }}>
          <span
            className="sb-pulse"
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--acc)',
              boxShadow: '0 0 5px rgba(124,110,247,0.6)',
            }}
          />
          <Sparkles size={9} />
          AI active
        </span>
        <span style={{ color: 'var(--t2)' }}>⌘K to command</span>
        <span style={{ color: 'var(--t3)' }}>
          {totalNotes} notes · {totalConnections.toLocaleString()} connections
        </span>
      </div>
    </div>
  );
}
