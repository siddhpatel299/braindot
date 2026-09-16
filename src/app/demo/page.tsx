'use client';

import { useEffect } from 'react';

export default function DemoPage() {
  useEffect(() => {
    localStorage.setItem('second-brain-demo', 'true');
    localStorage.removeItem('second-brain-user');
    localStorage.removeItem('second-brain-new-user');
    window.location.href = '/';
  }, []);

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', color: 'var(--t2)',
      fontFamily: 'var(--font-mono)', fontSize: 13,
    }}>
      loading demo…
    </div>
  );
}
