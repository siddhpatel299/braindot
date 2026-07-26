'use client';

import { useState, useEffect, useRef } from 'react';

// In-app replacement for window.prompt() / window.confirm() — themed, keyboard
// friendly (Enter confirms, Esc cancels), and consistent with the app.

export type DialogState =
  | {
      type: 'prompt';
      title: string;
      label?: string;
      defaultValue?: string;
      placeholder?: string;
      confirmLabel?: string;
      onConfirm: (value: string) => void;
    }
  | {
      type: 'confirm';
      title: string;
      message: string;
      confirmLabel?: string;
      danger?: boolean;
      onConfirm: () => void;
    }
  | null;

export function AppDialog({ dialog, onClose }: { dialog: DialogState; onClose: () => void }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dialog?.type === 'prompt') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(dialog.defaultValue ?? '');
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, onClose]);

  if (!dialog) return null;

  const isPrompt = dialog.type === 'prompt';
  const danger = dialog.type === 'confirm' && dialog.danger;

  const confirm = () => {
    if (dialog.type === 'prompt') dialog.onConfirm(value.trim());
    else dialog.onConfirm();
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="sb-fade-in"
        style={{
          width: 400, maxWidth: '100%',
          background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)', padding: 20,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: isPrompt ? 14 : 8 }}>
          {dialog.title}
        </div>

        {dialog.type === 'confirm' && (
          <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 18 }}>
            {dialog.message}
          </div>
        )}

        {dialog.type === 'prompt' && (
          <>
            {dialog.label && (
              <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                {dialog.label}
              </label>
            )}
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }}
              placeholder={dialog.placeholder}
              style={{
                width: '100%', background: 'var(--bg3)', border: '1px solid var(--bd2)',
                borderRadius: 5, padding: '10px 12px', color: 'var(--t1)', fontSize: 13,
                fontFamily: 'inherit', outline: 'none', caretColor: 'var(--acc2)', marginBottom: 18,
              }}
            />
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px', background: 'transparent', border: '1px solid var(--bd2)',
              borderRadius: 5, color: 'var(--t2)', fontSize: 12, fontFamily: 'inherit',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            style={{
              padding: '8px 16px',
              background: danger ? 'var(--red)' : 'var(--acc)',
              border: 'none', borderRadius: 5, color: '#fff', fontSize: 12,
              fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
            }}
          >
            {(dialog.type === 'prompt' && dialog.confirmLabel) ||
             (dialog.type === 'confirm' && dialog.confirmLabel) ||
             (isPrompt ? 'OK' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
