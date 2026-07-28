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
        // Mermaid derives shades from these values (darken/lighten), so they
        // must be literal colours — CSS variables would break its colour maths.
        // These mirror the app's blue accent ramp.
        const dark = theme !== 'light';
        const scale = dark
          ? ['#1b2b40', '#22384f', '#29455e', '#30526d', '#375f7c', '#3e6c8b']
          : ['#e8f1fb', '#dbe9f8', '#cee1f5', '#c1d9f2', '#b4d1ef', '#a7c9ec'];
        const accent = dark ? '#5aa0e8' : '#2c6fb5';
        const scaleText = dark ? '#e6edf5' : '#16304d';
        const ramp: Record<string, string> = {};
        scale.forEach((c, i) => {
          ramp[`cScale${i}`] = c;
          ramp[`cScaleLabel${i}`] = scaleText;
          ramp[`cScalePeer${i}`] = accent;
        });

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          themeVariables: {
            darkMode: dark,
            background: dark ? '#1d1d21' : '#ffffff',
            primaryColor: dark ? '#1f3350' : '#e8f1fb',
            primaryBorderColor: accent,
            primaryTextColor: dark ? '#eef1f5' : '#16304d',
            secondaryColor: dark ? '#26262b' : '#f2f4f7',
            tertiaryColor: dark ? '#212126' : '#f8f9fb',
            lineColor: accent,
            textColor: dark ? '#c3c7cf' : '#2a2f38',
            mainBkg: dark ? '#1f3350' : '#e8f1fb',
            nodeBorder: accent,
            clusterBkg: dark ? '#212126' : '#f4f6f9',
            clusterBorder: dark ? '#33333a' : '#dde1e7',
            titleColor: dark ? '#eef1f5' : '#16304d',
            fontSize: '13px',
            ...ramp,
          },
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
