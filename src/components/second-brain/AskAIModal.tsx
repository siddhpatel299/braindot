'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, Sparkles, Loader2, FileText, Library } from 'lucide-react';
import { Note } from '@/types';
import { streamAsk } from '@/lib/aiClient';
import { retrieveRelevantNotes, toContextNotes } from '@/utils/retrieval';

type Scope = 'note' | 'vault';

interface AskAIModalProps {
  open: boolean;
  onClose: () => void;
  note: Note | null;
  allNotes: Note[];
  /** Open directly in vault mode (e.g. from the dashboard) */
  initialScope?: Scope;
  onOpenNoteByTitle?: (title: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** titles of the vault notes used as context (assistant messages, vault scope) */
  sources?: string[];
}

const NOTE_SUGGESTIONS = [
  'What is the strongest counter-argument to this note?',
  'What is missing from this note?',
  'How could I connect this to my other notes?',
  'Rewrite the opening paragraph to be more direct.',
];

const VAULT_SUGGESTIONS = [
  'What themes keep showing up across my notes?',
  'Summarize what I know about learning techniques.',
  'Which of my notes contradict each other?',
  'What should I write about next, given my recent notes?',
];

export function AskAIModal({ open, onClose, note, allNotes, initialScope, onOpenNoteByTitle }: AskAIModalProps) {
  const [scope, setScope] = useState<Scope>('note');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setQuestion('');
      setMessages([]);
      setError(null);
      setScope(initialScope || (note ? 'note' : 'vault'));
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      abortRef.current?.abort();
    }
  }, [open, note?.id, initialScope, note]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const switchScope = (s: Scope) => {
    if (s === scope) return;
    abortRef.current?.abort();
    setScope(s);
    setMessages([]);
    setError(null);
    setLoading(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    if (scope === 'note' && !note) return;

    const userMsg: ChatMessage = { role: 'user', content: q.trim() };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let sources: string[] | undefined;
      let payload;
      if (scope === 'vault') {
        const retrieved = retrieveRelevantNotes(q, allNotes, 6);
        sources = retrieved.map((r) => r.note.title);
        payload = {
          question: q.trim(),
          history,
          scope: 'vault' as const,
          contextNotes: toContextNotes(retrieved),
        };
      } else {
        payload = {
          noteTitle: note!.title,
          noteBody: note!.body,
          noteTags: note!.tags,
          question: q.trim(),
          history,
          scope: 'note' as const,
        };
      }

      // Stream into a live assistant bubble
      let started = false;
      await streamAsk(payload, (full) => {
        if (!started) {
          started = true;
          setLoading(false);
          setMessages((prev) => [...prev, { role: 'assistant', content: full, sources }]);
        } else {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: full };
            return next;
          });
        }
      }, controller.signal);
      if (!started) {
        setMessages((prev) => [...prev, { role: 'assistant', content: '(no response)', sources }]);
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(question);
    }
  };

  // Render [[wiki-links]] in assistant messages as clickable spans
  const renderContent = (content: string) => {
    const parts = content.split(/(\[\[[^\]]+\]\])/g);
    return parts.map((part, i) => {
      const m = part.match(/^\[\[([^\]]+)\]\]$/);
      if (m && onOpenNoteByTitle) {
        return (
          <span
            key={i}
            onClick={() => { onOpenNoteByTitle(m[1]); onClose(); }}
            style={{ color: 'var(--acc2)', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  if (!open) return null;

  const suggestions = scope === 'vault' ? VAULT_SUGGESTIONS : NOTE_SUGGESTIONS;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="sb-fade-in"
        style={{
          width: 680,
          maxWidth: '100%',
          height: '72vh',
          maxHeight: 640,
          background: 'var(--bg2)',
          border: '1px solid var(--bd2)',
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,110,247,0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header with scope toggle */}
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--bd)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Sparkles size={14} color="var(--acc2)" />
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg3)', borderRadius: 4, padding: 2 }}>
            <ScopeTab
              icon={FileText}
              label="this note"
              active={scope === 'note'}
              disabled={!note}
              onClick={() => switchScope('note')}
            />
            <ScopeTab
              icon={Library}
              label="whole vault"
              active={scope === 'vault'}
              onClick={() => switchScope('vault')}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {scope === 'note' ? note?.title : `${allNotes.length} notes searchable`}
          </div>
          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              width: 22, height: 22, borderRadius: 3,
              background: 'transparent', border: 'none',
              color: 'var(--t3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="sb-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {messages.length === 0 && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>
                {scope === 'vault'
                  ? 'The AI searches your whole vault and cites the notes it uses. Try:'
                  : 'The AI can see the full note body. Try one of these:'}
              </div>
              {suggestions.map((sq) => (
                <button
                  key={sq}
                  onClick={() => ask(sq)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    background: 'var(--bg3)',
                    border: '1px solid var(--bd)',
                    borderRadius: 4,
                    color: 'var(--t2)',
                    fontSize: 11,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'background 0.12s, border 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--acc-bg)';
                    e.currentTarget.style.borderColor = 'var(--acc)';
                    e.currentTarget.style.color = 'var(--t1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--bg3)';
                    e.currentTarget.style.borderColor = 'var(--bd)';
                    e.currentTarget.style.color = 'var(--t2)';
                  }}
                >
                  {sq}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
              <div
                style={{
                  maxWidth: '88%',
                  padding: '8px 12px',
                  background: m.role === 'user' ? 'var(--acc-bg)' : 'var(--bg3)',
                  border: '1px solid ' + (m.role === 'user' ? 'var(--acc-bd)' : 'var(--bd)'),
                  borderRadius: 4,
                  color: m.role === 'user' ? 'var(--t1)' : 'var(--t2)',
                  fontSize: 11,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.role === 'assistant' ? renderContent(m.content) : m.content}
              </div>
              {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: '88%' }}>
                  <span style={{ fontSize: 9, color: 'var(--t3)', alignSelf: 'center' }}>searched:</span>
                  {m.sources.map((s) => (
                    <button
                      key={s}
                      onClick={() => { onOpenNoteByTitle?.(s); onClose(); }}
                      style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 3,
                        background: 'var(--bg3)', border: '1px solid var(--bd)',
                        color: 'var(--t3)', fontFamily: 'inherit',
                        cursor: onOpenNoteByTitle ? 'pointer' : 'default',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div
              style={{
                alignSelf: 'flex-start',
                padding: '8px 12px',
                background: 'var(--bg3)',
                border: '1px solid var(--bd)',
                borderRadius: 4,
                color: 'var(--t3)',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Loader2 size={12} className="sb-spin" />
              {scope === 'vault' ? 'searching your vault…' : 'thinking…'}
            </div>
          )}
          {error && (
            <div
              style={{
                alignSelf: 'flex-start',
                padding: '8px 12px',
                background: 'rgba(248,113,113,0.1)',
                border: '1px solid var(--red)',
                borderRadius: 4,
                color: 'var(--red)',
                fontSize: 11,
              }}
            >
              error: {error}
            </div>
          )}
        </div>

        {/* Input */}
        <div
          style={{
            borderTop: '1px solid var(--bd)',
            padding: 10,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              scope === 'vault'
                ? 'ask your whole vault… (Enter to send)'
                : 'ask anything about this note… (Enter to send, Shift+Enter for newline)'
            }
            rows={1}
            style={{
              flex: 1,
              background: 'var(--bg3)',
              border: '1px solid var(--bd2)',
              borderRadius: 4,
              padding: '8px 10px',
              color: 'var(--t1)',
              fontSize: 11,
              fontFamily: 'inherit',
              outline: 'none',
              resize: 'none',
              minHeight: 34,
              maxHeight: 120,
              caretColor: 'var(--acc2)',
            }}
          />
          <button
            onClick={() => ask(question)}
            disabled={!question.trim() || loading}
            style={{
              height: 34,
              padding: '0 12px',
              background: question.trim() && !loading ? 'var(--acc)' : 'var(--bg3)',
              color: question.trim() && !loading ? '#fff' : 'var(--t3)',
              border: '1px solid ' + (question.trim() && !loading ? 'var(--acc)' : 'var(--bd2)'),
              borderRadius: 4,
              fontSize: 11,
              fontFamily: 'inherit',
              cursor: question.trim() && !loading ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontWeight: 600,
            }}
          >
            <Send size={11} />
            ask
          </button>
        </div>
      </div>
      <style>{`
        @keyframes sb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .sb-spin { animation: sb-spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

function ScopeTab({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '4px 10px',
        borderRadius: 3,
        background: active ? 'var(--bg1)' : 'transparent',
        border: 'none',
        color: disabled ? 'var(--t3)' : active ? 'var(--t1)' : 'var(--t3)',
        opacity: disabled ? 0.4 : 1,
        fontSize: 11,
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        fontWeight: active ? 600 : 400,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      <Icon size={11} />
      {label}
    </button>
  );
}
