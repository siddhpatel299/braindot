'use client';

import { Cloud, CloudOff, Flame } from 'lucide-react';
import { plural } from '@/utils/markdown';

interface StatusBarProps {
  wordCount: number;
  linkCount: number;
  dirty: boolean;
  totalNotes: number;
  totalConnections: number;
  streak: number;
  /** 'synced' | 'syncing' | 'local' — omit to hide the chip */
  syncState?: 'synced' | 'syncing' | 'local';
}

const cell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  whiteSpace: 'nowrap',
};

/**
 * Ambient state, and only state.
 *
 * Everything here answers "what is true right now" — saved, synced, how long
 * the note is, how big the vault is. Actions belong on the rail; this line
 * never asks to be clicked, so it can stay quiet and thin.
 */
export function StatusBar({
  wordCount,
  linkCount,
  dirty,
  totalNotes,
  totalConnections,
  streak,
  syncState,
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
        gap: 14,
        fontSize: 10.5,
        letterSpacing: '0.03em',
        fontFamily: 'inherit',
        color: 'var(--t3)',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <span style={{ ...cell, color: dirty ? 'var(--amb)' : 'var(--t2)' }}>
          <span
            aria-hidden="true"
            style={{
              width: 5, height: 5, borderRadius: '50%',
              background: dirty ? 'var(--amb)' : 'var(--grn)',
            }}
          />
          {dirty ? 'saving…' : 'saved'}
        </span>
        <span style={cell}>{plural(wordCount, 'word')}</span>
        <span style={cell}>{plural(linkCount, 'link')}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        {streak > 0 && (
          <span style={{ ...cell, color: 'var(--amb)' }} title={`${streak}-day writing streak`}>
            <Flame size={11} strokeWidth={2} />
            {streak}d
          </span>
        )}
        {syncState && (
          <span
            style={{ ...cell, color: syncState === 'local' ? 'var(--t3)' : 'var(--t2)' }}
            title={
              syncState === 'syncing' ? 'Saving to the cloud'
                : syncState === 'synced' ? 'Everything is in the cloud'
                  : 'Saved on this device only — sign in to sync'
            }
          >
            {syncState === 'local' ? <CloudOff size={11} strokeWidth={2} /> : <Cloud size={11} strokeWidth={2} />}
            {syncState === 'syncing' ? 'syncing' : syncState}
          </span>
        )}
        <span style={cell}>
          {plural(totalNotes, 'note')} · {plural(totalConnections, 'connection')}
        </span>
      </div>
    </div>
  );
}
