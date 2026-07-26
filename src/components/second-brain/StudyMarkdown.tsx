'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Mermaid } from './Mermaid';

// Renders a tutor message: Markdown for prose, live Mermaid diagrams for
// ```mermaid fences. Wiki-links [[Title]] are left as plain text (they become
// clickable once saved into a note).

export function StudyMarkdown({ content }: { content: string }) {
  return (
    <div className="sb-study-md" style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--t1)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const text = String(children ?? '');
            const lang = /language-(\w+)/.exec(className || '')?.[1];
            if (lang === 'mermaid') {
              return <Mermaid chart={text.replace(/\n$/, '')} />;
            }
            const isBlock = (className || '').includes('language-') || text.includes('\n');
            if (isBlock) {
              return (
                <pre style={{
                  background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 6,
                  padding: '10px 12px', margin: '10px 0', overflowX: 'auto',
                  fontSize: 12, color: 'var(--grn)',
                }}>
                  <code {...props}>{children}</code>
                </pre>
              );
            }
            return (
              <code style={{
                background: 'var(--bg3)', color: 'var(--grn)', padding: '1px 5px',
                borderRadius: 3, fontSize: '0.92em', border: '1px solid var(--bd)',
              }} {...props}>{children}</code>
            );
          },
          h1: ({ children }) => <h3 style={{ fontSize: 16, fontWeight: 700, margin: '14px 0 6px', color: 'var(--t1)' }}>{children}</h3>,
          h2: ({ children }) => <h4 style={{ fontSize: 14, fontWeight: 700, margin: '12px 0 5px', color: 'var(--t1)' }}>{children}</h4>,
          h3: ({ children }) => <h5 style={{ fontSize: 13, fontWeight: 700, margin: '10px 0 4px', color: 'var(--t1)' }}>{children}</h5>,
          p: ({ children }) => <p style={{ margin: '0 0 9px' }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: '0 0 9px', paddingLeft: 20 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '0 0 9px', paddingLeft: 22 }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
          strong: ({ children }) => <strong style={{ color: 'var(--t1)', fontWeight: 700 }}>{children}</strong>,
          em: ({ children }) => <em style={{ color: 'var(--acc2)' }}>{children}</em>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--acc2)', textDecoration: 'underline' }}>{children}</a>,
          blockquote: ({ children }) => (
            <blockquote style={{ borderLeft: '3px solid var(--acc)', background: 'var(--acc-bg)', margin: '10px 0', padding: '6px 12px', borderRadius: '0 5px 5px 0', color: 'var(--callout-text)' }}>{children}</blockquote>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '10px 0' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>{children}</table>
            </div>
          ),
          th: ({ children }) => <th style={{ border: '1px solid var(--bd)', padding: '5px 9px', background: 'var(--bg3)', textAlign: 'left', color: 'var(--t1)' }}>{children}</th>,
          td: ({ children }) => <td style={{ border: '1px solid var(--bd)', padding: '5px 9px', color: 'var(--t2)' }}>{children}</td>,
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--bd)', margin: '12px 0' }} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
