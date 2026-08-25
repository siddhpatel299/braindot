'use client';

import { LucideIcon, LayoutDashboard, StickyNote, BookOpen, KanbanSquare, Search, Plus } from 'lucide-react';
import { IconRailView } from './IconRail';

/** The rail turned on its side.
 *
 *  Same idea as IconRail — it switches *places*, never performs an action —
 *  with two departures forced by the hardware. It sits at the bottom, because
 *  that is the half of a phone a thumb can reach; and it carries only the five
 *  places worth a permanent tab. Graph and canvas are desk work and are reached
 *  from the dashboard instead, so they do not spend a tab here.
 */
const TABS: { view: IconRailView; icon: LucideIcon; label: string }[] = [
  { view: 'dashboard', icon: LayoutDashboard, label: 'Home' },
  { view: 'notes', icon: StickyNote, label: 'Notes' },
  { view: 'reading', icon: BookOpen, label: 'Read' },
  { view: 'kanban', icon: KanbanSquare, label: 'Tasks' },
  { view: 'search', icon: Search, label: 'Search' },
];

interface MobileTabBarProps {
  active: IconRailView;
  onSelect: (view: IconRailView) => void;
  onCreateNote: () => void;
}

export function MobileTabBar({ active, onSelect, onCreateNote }: MobileTabBarProps) {
  return (
    <nav
      aria-label="Main"
      className="sb-tabbar"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--bg1)',
        borderTop: '1px solid var(--bd)',
        flexShrink: 0,
        // The bar owns the home-indicator strip so the ground colour runs to
        // the bottom of the screen, and pads itself back out of it.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {TABS.map(({ view, icon: Icon, label }) => {
        const on = active === view;
        return (
          <button
            key={view}
            onClick={() => onSelect(view)}
            aria-label={label}
            aria-current={on ? 'page' : undefined}
            style={{
              flex: 1,
              minWidth: 0,
              // 48px of height even before the safe-area pad: a tab you miss
              // is worse than a tab that costs a few pixels.
              minHeight: 48,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '6px 2px 7px',
              background: 'transparent',
              border: 'none',
              color: on ? 'var(--acc2)' : 'var(--t3)',
              fontFamily: 'inherit',
              fontSize: 9.5,
              letterSpacing: '0.02em',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Icon size={19} strokeWidth={on ? 2.1 : 1.8} />
            {label.toLowerCase()}
          </button>
        );
      })}

      {/* Capture is the one action on the bar, and it is the reason the app is
          on a phone at all — a thought caught away from the desk. It is marked
          as an action, not a place: filled, no label, no current state. */}
      <button
        onClick={onCreateNote}
        aria-label="New note"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px 2px 7px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--acc)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus size={18} strokeWidth={2.4} />
        </span>
      </button>
    </nav>
  );
}
