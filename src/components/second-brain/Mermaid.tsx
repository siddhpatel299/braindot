'use client';

import { useEffect, useRef, useState, useId } from 'react';

// Renders a Mermaid diagram (flowchart, timeline, mindmap, gantt, sequence…)
// to SVG. Theme-aware, re-renders when the diagram source or app theme
// changes, and shows the raw source with an error if the diagram is invalid
// (the AI occasionally emits slightly-off syntax mid-stream).

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        fontFamily: "'JetBrains Mono', monospace",
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

function currentTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(currentTheme);
  const containerRef = useRef<HTMLDivElement>(null);
  const rid = useId().replace(/[^a-zA-Z0-9]/g, '');

  // Re-render on app theme change
  useEffect(() => {
    const onTheme = () => setTheme(currentTheme());
    window.addEventListener('theme-changed', onTheme);
    return () => window.removeEventListener('theme-changed', onTheme);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const source = chart.trim();
    if (!source) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSvg(''); setError(null); return;
    }
    (async () => {
      try {
        const mermaid = await getMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'light' ? 'neutral' : 'dark',
          fontFamily: "'JetBrains Mono', monospace",
          themeVariables: theme === 'light'
            ? { primaryColor: '#eeecfd', primaryBorderColor: '#5b4fe8', lineColor: '#5b4fe8', primaryTextColor: '#1a1a18' }
            : { primaryColor: '#1a1830', primaryBorderColor: '#7c6ef7', lineColor: '#7c6ef7', primaryTextColor: '#f0f0f2' },
        });
        // Validate first so a mid-stream partial diagram doesn't throw noisily
        await mermaid.parse(source);
        const { svg: out } = await mermaid.render('mmd-' + rid, source);
        if (!cancelled) { setSvg(out); setError(null); }
      } catch (e) {
        if (!cancelled) {
          setSvg('');
          setError(e instanceof Error ? e.message : 'Could not render diagram');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [chart, theme, rid]);

  if (error) {
    return (
      <div style={{
        background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 6,
        padding: '10px 12px', margin: '10px 0',
      }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', marginBottom: 6 }}>
          diagram
        </div>
        <pre style={{ margin: 0, fontSize: 12, color: 'var(--t2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {chart.trim()}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="sb-mermaid"
      style={{
        margin: '12px 0', padding: 12, background: 'var(--bg1)',
        border: '1px solid var(--bd)', borderRadius: 8, overflowX: 'auto',
        display: 'flex', justifyContent: 'center',
      }}
      dangerouslySetInnerHTML={{ __html: svg || '<div style="color:var(--t3);font-size:12px;padding:8px">rendering…</div>' }}
    />
  );
}
