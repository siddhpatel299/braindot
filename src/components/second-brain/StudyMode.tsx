'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, GraduationCap, Loader2, BookmarkPlus, Check } from 'lucide-react';
import { Note } from '@/types';
import { streamAsk } from '@/lib/aiClient';
import { StudyMarkdown } from './StudyMarkdown';

interface StudyModeProps {
  open: boolean;
  onClose: () => void;
  /** The note that anchors the topic (its title = what we're studying). */
  note: Note | null;
  /** Append markdown (a saved answer or diagram) into the active note. */
  onSaveToNote: (markdown: string) => void;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const STARTERS = [
  'How long should I plan to prepare, and what should I study first?',
  'Teach me the first topic, step by step.',
  'Quiz me on what I should already know.',
  'Give me a study plan as a timeline.',
];

export function StudyMode({ open, onClose, note, onSaveToNote }: StudyModeProps) {
  const topic = note?.title && note.title !== 'Untitled note' ? note.title : '';
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIdx, setSavedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setMessages([]);
      setInput('');
      setError(null);
      setSavedIdx(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      abortRef.current?.abort();
    }
  }, [open, note?.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Close on Escape (unless the user is mid-typing with text)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.activeElement !== inputRef.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: text.trim() }]);
    setInput('');
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let started = false;
      await streamAsk(
        {
          question: text.trim(),
          history,
          scope: 'study',
          topic: topic || undefined,
          noteBody: note?.body,
        },
        (full) => {
          if (!started) {
            started = true;
            setLoading(false);
            setMessages((prev) => [...prev, { role: 'assistant', content: full }]);
          } else {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: full };
              return next;
            });
          }
        },
        controller.signal,
      );
      if (!started) setMessages((prev) => [...prev, { role: 'assistant', content: '(no response)' }]);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [loading, messages, topic, note?.body]);

  // Save a message (or the user's current text selection within it) to the note.
  const save = useCallback((msg: Msg, idx: number) => {
    const sel = window.getSelection()?.toString().trim();
    const md = sel && sel.length > 0 ? sel : msg.content;
    onSaveToNote(md);
    setSavedIdx(idx);
    setTimeout(() => setSavedIdx((cur) => (cur === idx ? null : cur)), 1600);
  }, [onSaveToNote]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 90,
        width: 460, maxWidth: '96vw',
        background: 'var(--bg2)', borderLeft: '1px solid var(--bd2)',
        boxShadow: '-16px 0 48px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column',
      }}
      className="sb-fade-in"
    >
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--acc-bg)', border: '1px solid var(--acc-bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GraduationCap size={15} color="var(--acc2)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>study mode</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {topic ? `studying: ${topic}` : 'name this note after your topic for best results'}
          </div>
        </div>
        <button onClick={onClose} title="Close (Esc)" style={{ width: 24, height: 24, borderRadius: 4, background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={15} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
              An interactive tutor. It teaches in small steps, asks you questions, and draws diagrams &amp; timelines. Save any answer or diagram into this note with the <BookmarkPlus size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> button.
            </div>
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{ textAlign: 'left', padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 4, color: 'var(--t2)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--acc)'; e.currentTarget.style.color = 'var(--t1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.color = 'var(--t2)'; }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'stretch', gap: 4 }}>
            {m.role === 'user' ? (
              <div style={{ maxWidth: '88%', padding: '8px 12px', background: 'var(--acc-bg)', border: '1px solid var(--acc-bd)', borderRadius: 6, color: 'var(--t1)', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                {m.content}
              </div>
            ) : (
              <div style={{ padding: '4px 2px' }}>
                <StudyMarkdown content={m.content} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <button
                    onClick={() => save(m, i)}
                    title="Save this to your note (or select text first to save just that)"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, fontSize: 10,
                      padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
                      background: savedIdx === i ? 'var(--grn-bg)' : 'var(--bg3)',
                      border: '1px solid ' + (savedIdx === i ? 'var(--grn-bd)' : 'var(--bd)'),
                      color: savedIdx === i ? 'var(--grn)' : 'var(--t3)',
                    }}
                    onMouseEnter={(e) => { if (savedIdx !== i) e.currentTarget.style.color = 'var(--acc2)'; }}
                    onMouseLeave={(e) => { if (savedIdx !== i) e.currentTarget.style.color = 'var(--t3)'; }}
                  >
                    {savedIdx === i ? <><Check size={11} /> saved to note</> : <><BookmarkPlus size={11} /> save to note</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ alignSelf: 'flex-start', padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 4, color: 'var(--t3)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={12} className="sb-spin" /> thinking…
          </div>
        )}
        {error && (
          <div style={{ padding: '8px 12px', background: 'rgba(248,113,113,0.1)', border: '1px solid var(--red)', borderRadius: 4, color: 'var(--red)', fontSize: 11 }}>
            error: {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ borderTop: '1px solid var(--bd)', padding: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="answer, or ask the tutor anything…"
          rows={1}
          style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 4, padding: '8px 10px', color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none', minHeight: 36, maxHeight: 120, caretColor: 'var(--acc2)' }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          style={{ height: 36, padding: '0 12px', background: input.trim() && !loading ? 'var(--acc)' : 'var(--bg3)', color: input.trim() && !loading ? '#fff' : 'var(--t3)', border: '1px solid ' + (input.trim() && !loading ? 'var(--acc)' : 'var(--bd2)'), borderRadius: 4, fontSize: 11, fontFamily: 'inherit', cursor: input.trim() && !loading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}
        >
          <Send size={11} /> send
        </button>
      </div>
      <style>{`@keyframes sb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .sb-spin { animation: sb-spin 1s linear infinite; }`}</style>
    </div>
  );
}
