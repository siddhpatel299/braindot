'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Fraction of the viewport the sheet rises to. Default is most of it. */
  height?: string;
  children: React.ReactNode;
}

/**
 * What the right-hand panel becomes when there is no right-hand side.
 *
 * The desktop shell puts the apparatus — format, backlinks, the AI thread — in
 * a 300px margin. A phone has no margin, so the apparatus comes up over the
 * page when it is asked for and gets out of the way when it is not. It is
 * always dismissible by the two gestures people already try: the backdrop and
 * the system back key (Escape, and the hardware back on Android via history).
 */
export function MobileSheet({ open, onClose, title, height = '82dvh', children }: MobileSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, and while the sheet is up the page behind it does not
  // scroll — a sheet that scrolls the document underneath reads as broken.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Move focus into the sheet so the next Tab lands inside it rather than in
  // the editor still mounted behind.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="sb-sheet-rise"
        style={{
          position: 'relative',
          maxHeight: height,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg1)',
          borderTop: '1px solid var(--bd2)',
          borderRadius: '12px 12px 0 0',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.45)',
          outline: 'none',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 6px 8px 14px',
            borderBottom: '1px solid var(--bd)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 40, height: 40, borderRadius: 6, background: 'transparent', border: 'none',
              color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
