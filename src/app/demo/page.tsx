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
      minHeight: '100vh', background: '#0c0c0e', display: 'flex',
      alignItems: 'center', justifyContent: 'center', color: '#444450',
      fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
    }}>
      loading demo…
    </div>
  );
}
