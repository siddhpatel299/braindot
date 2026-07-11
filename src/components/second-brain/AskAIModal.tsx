'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, Sparkles, Loader2 } from 'lucide-react';
import { Note } from '@/types';

interface AskAIModalProps {
  open: boolean;
  onClose: () => void;
  note: Note | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function AskAIModal({ open, onClose, note }: AskAIModalProps) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuestion('');
      setMessages([]);
      setError(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, note?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const suggestedQuestions = [
    'What is the strongest counter-argument to this note?',
    'What is missing from this note?',
    'How could I connect this to my other notes?',
    'Rewrite the opening paragraph to be more direct.',
  ];

  const ask = async (q: string) => {
    if (!q.trim() || !note || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: q.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setQuestion('');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/ask?XTransformPort=3000', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteTitle: note.title,
          noteBody: note.body,
          noteTags: note.tags,
          question: q.trim(),
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(question);
    }
  };

  if (!open) return null;

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
          width: 640,
          maxWidth: '100%',
          height: '70vh',
          maxHeight: 600,
          background: 'var(--bg2)',
          border: '1px solid var(--bd2)',
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,110,247,0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--bd)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Sparkles size={14} color="var(--acc2)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 600 }}>ask AI about this note</div>
            <div style={{ fontSize: 9, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {note?.title}
            </div>
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
                The AI can see the full note body. Try one of these:
              </div>
              {suggestedQuestions.map((sq) => (
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
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
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
              {m.content}
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
              thinking…
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
            placeholder="ask anything about this note… (Enter to send, Shift+Enter for newline)"
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
