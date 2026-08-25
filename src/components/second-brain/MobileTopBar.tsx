'use client';

import { Sun, Moon, LogOut } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { LogoMark } from './Logo';

interface MobileTopBarProps {
  title: string;
  onHome: () => void;
  onSignOut?: () => void;
}

/**
 * The rail's non-navigational half — mark, theme, sign out — on the browse
 * views only. It is deliberately absent from the editor: the writing surface
 * gets the whole screen, and everything this row offers is a tab away.
 */
export function MobileTopBar({ title, onHome, onSignOut }: MobileTopBarProps) {
  const { theme, toggle } = useTheme();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 42,
        flexShrink: 0,
        padding: '0 4px 0 10px',
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--bd)',
      }}
    >
      <button
        onClick={onHome}
        aria-label="Braindot — dashboard"
        style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          background: 'var(--acc-bg)', border: '1px solid var(--acc-bd)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <LogoMark size={15} />
      </button>

      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 12, color: 'var(--t2)', letterSpacing: '0.04em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {title}
      </span>

      <button
        onClick={toggle}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        style={barButton}
      >
        {theme === 'dark' ? <Sun size={17} strokeWidth={1.9} /> : <Moon size={17} strokeWidth={1.9} />}
      </button>

      {onSignOut && (
        <button onClick={onSignOut} aria-label="Sign out" style={barButton}>
          <LogOut size={17} strokeWidth={1.9} />
        </button>
      )}
    </div>
  );
}

const barButton: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 6,
  flexShrink: 0,
  background: 'transparent',
  border: 'none',
  color: 'var(--t3)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  WebkitTapHighlightColor: 'transparent',
};
