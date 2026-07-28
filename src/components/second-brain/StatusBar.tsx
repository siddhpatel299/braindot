'use client';

import { Check, Link2, AlignLeft, Sparkles } from 'lucide-react';
import { plural } from '@/utils/markdown';

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
        height: 28,
        background: 'var(--bg1)',
        borderTop: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        fontSize: 11,
        fontFamily: 'inherit',
        color: 'var(--t3)',
        flexShrink: 0,
      }}
    >
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: dirty ? 'var(--amb)' : 'var(--grn)' }}>
          <Check size={12} strokeWidth={2.5} />
          {dirty ? 'unsaved' : 'autosaved'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Link2 size={12} strokeWidth={2} />
          {plural(linkCount, 'link')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <AlignLeft size={12} strokeWidth={2} />
          {plural(wordCount, 'word')}
        </span>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--acc2)' }}>
          <span
            className="sb-pulse"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--acc)',
              boxShadow: '0 0 6px rgba(124,110,247,0.6)',
            }}
          />
          <Sparkles size={11} />
          AI active
        </span>
        <span style={{ color: 'var(--t2)' }}>⌘K to command</span>
        <span style={{ color: 'var(--t3)' }}>
          {plural(totalNotes, 'note')} · {plural(totalConnections, 'connection')}
        </span>
      </div>
    </div>
  );
}
