'use client';

import { LucideIcon } from 'lucide-react';

/**
 * The one header every full-screen view uses.
 *
 * Each view used to invent its own stack — Kanban had a 44px breadcrumb row on
 * a 40px stat row, Canvas a 44px toolbar on a 36px stat bar, Reading a toolbar
 * on a toolbar. That pushed content 80–86px down and made four views look like
 * four apps. One 44px row instead: what you're looking at on the left, what you
 * can do to it on the right.
 *
 * There is deliberately no breadcrumb. The icon rail is the navigation, and
 * "dashboard /" was never a real destination from inside a view.
 */
interface ViewHeaderProps {
  icon: LucideIcon;
  /** Plain string, or a node when the title is itself a control (e.g. a board picker). */
  title: React.ReactNode;
  /** Quiet supporting numbers — "17 open · 1 overdue · 4 linked to notes". */
  facts?: string;
  /** Right-aligned controls. */
  children?: React.ReactNode;
}

export function ViewHeader({ icon: Icon, title, facts, children }: ViewHeaderProps) {
  return (
    <div
      className="sb-viewheader"
      style={{
        height: 44,
        flexShrink: 0,
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 18px',
        gap: 14,
      }}
    >
      <Icon size={14} color="var(--acc2)" strokeWidth={1.75} style={{ flexShrink: 0 }} />
      {typeof title === 'string' ? (
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', whiteSpace: 'nowrap' }}>{title}</span>
      ) : (
        title
      )}
      {facts && (
        <span
          className="sb-viewheader-facts"
          style={{
            fontSize: 10.5,
            color: 'var(--t3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {facts}
        </span>
      )}
      {children && (
        <div
          className="sb-viewheader-actions"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* ---------- shared header controls ---------- */

/** Segmented control, e.g. board | list. */
export function HeaderSegment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 5, padding: 2, gap: 1 }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              height: 24,
              padding: '0 10px',
              borderRadius: 4,
              border: 'none',
              background: active ? 'var(--bg4)' : 'transparent',
              color: active ? 'var(--t1)' : 'var(--t3)',
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              whiteSpace: 'nowrap',
            }}
          >
            {o.icon && <o.icon size={11} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Outlined header button — the default weight for view controls. */
export function HeaderButton({
  icon: Icon,
  label,
  onClick,
  accent,
  title,
}: {
  icon?: LucideIcon;
  label: string;
  onClick?: () => void;
  /** Use for the view's one meaningful outcome, not for ordinary controls. */
  accent?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        height: 28,
        padding: '0 11px',
        borderRadius: 5,
        border: `1px solid ${accent ? 'var(--acc-bd)' : 'var(--bd2)'}`,
        background: accent ? 'var(--acc-bg)' : 'transparent',
        color: accent ? 'var(--acc2)' : 'var(--t2)',
        fontSize: 11,
        fontWeight: accent ? 600 : 400,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        if (!accent) {
          e.currentTarget.style.color = 'var(--t1)';
          e.currentTarget.style.borderColor = 'var(--acc-bd)';
        }
      }}
      onMouseLeave={(e) => {
        if (!accent) {
          e.currentTarget.style.color = 'var(--t2)';
          e.currentTarget.style.borderColor = 'var(--bd2)';
        }
      }}
    >
      {Icon && <Icon size={12} strokeWidth={1.75} />}
      {label}
    </button>
  );
}

export function HeaderDivider() {
  return <span style={{ width: 1, height: 18, background: 'var(--bd)', flexShrink: 0 }} />;
}

/**
 * Empty state for a whole view. Every view had none — you'd land on a blank
 * grid with no idea what it wanted from you.
 */
export function ViewEmptyState({
  icon: Icon,
  heading,
  body,
  primaryLabel,
  onPrimary,
  secondary,
}: {
  icon: LucideIcon;
  heading: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondary?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: 'var(--acc-bg)',
            border: '1px solid var(--acc-bd)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <Icon size={16} color="var(--acc2)" strokeWidth={1.75} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3, marginBottom: 9 }}>
          {heading}
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.75, color: 'var(--t2)', margin: '0 0 20px' }}>{body}</p>
        <button
          onClick={onPrimary}
          style={{
            height: 32,
            padding: '0 14px',
            borderRadius: 5,
            background: 'var(--acc)',
            border: '1px solid var(--acc)',
            color: '#fff',
            fontSize: 11.5,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--acc2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--acc)')}
        >
          {primaryLabel}
        </button>
        {secondary && <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 10 }}>{secondary}</div>}
      </div>
    </div>
  );
}
