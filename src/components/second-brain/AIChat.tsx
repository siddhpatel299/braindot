'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, BookmarkPlus, Check, CornerDownLeft } from 'lucide-react';
import { Note } from '@/types';
import { streamAsk } from '@/lib/aiClient';
import { retrieveRelevantNotes, toContextNotes } from '@/utils/retrieval';
import { StudyMarkdown } from './StudyMarkdown';

export type AIMode = 'note' | 'vault' | 'study';

interface AIChatProps {
  mode: AIMode;
  note: Note | null;
  allNotes: Note[];
  /** Append markdown (an answer or a diagram) into the open note. */
  onSaveToNote: (markdown: string) => void;
  onOpenNoteByTitle?: (title: string) => void;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  /** vault mode: titles of the notes retrieved as context */
  sources?: string[];
}

const COPY: Record<AIMode, { intro: string; starters: string[] }> = {
  note: {
    intro:
      'Ask about the open note. It can see the full text — pressure-test a claim, find the gap, suggest a connection.',
    starters: ["What's the weakest claim here?", 'What am I missing?', 'Which notes should this link to?'],
  },
  vault: {
    intro: 'Ask across every note. Answers cite the notes they drew on.',
    starters: [
      'What themes keep showing up?',
      'Which of my notes contradict each other?',
      'What should I write about next?',
    ],
  },
  study: {
    intro:
      'Pick a topic note and be taught it, one question at a time. Diagrams and answers can be saved straight into the note.',
    starters: ['Teach me this note', 'Make a study calendar', 'Draw this as a mind map'],
  },
};

export function AIChat({ mode, note, allNotes, onSaveToNote, onOpenNoteByTitle }: AIChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIdx, setSavedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const topic = note?.title && note.title !== 'Untitled note' ? note.title : '';

  // Switching notes changes what "this note" and "study" even mean, so the
  // thread is reset rather than silently answering about the wrong note.
  useEffect(() => {
    setMessages([]);
    setError(null);
    setSavedIdx(null);
    abortRef.current?.abort();
  }, [note?.id, mode]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || loading) return;
      if (mode !== 'vault' && !note) return;

      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, { role: 'user', content: q }]);
      setInput('');
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        let sources: string[] | undefined;
        let payload;
        if (mode === 'vault') {
          const retrieved = retrieveRelevantNotes(q, allNotes, 6);
          sources = retrieved.map((r) => r.note.title);
          payload = { question: q, history, scope: 'vault' as const, contextNotes: toContextNotes(retrieved) };
        } else if (mode === 'study') {
          payload = {
            question: q,
            history,
            scope: 'study' as const,
            topic: topic || undefined,
            noteBody: note!.body,
          };
        } else {
          payload = {
            noteTitle: note!.title,
            noteBody: note!.body,
            noteTags: note!.tags,
            question: q,
            history,
            scope: 'note' as const,
          };
        }

        let started = false;
        await streamAsk(
          payload,
          (full) => {
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
          },
          controller.signal,
        );
        if (!started) setMessages((prev) => [...prev, { role: 'assistant', content: '(no response)', sources }]);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setError(e instanceof Error ? e.message : 'Unknown error');
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [loading, messages, mode, note, allNotes, topic],
  );

  // Saves the current text selection if there is one, otherwise the whole message.
  const save = useCallback(
    (msg: Msg, idx: number) => {
      const sel = window.getSelection()?.toString().trim();
      onSaveToNote(sel && sel.length > 0 ? sel : msg.content);
      setSavedIdx(idx);
      setTimeout(() => setSavedIdx((cur) => (cur === idx ? null : cur)), 1600);
    },
    [onSaveToNote],
  );

  const copy = COPY[mode];
  const needsNote = mode !== 'vault' && !note;
  const empty = messages.length === 0 && !loading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Thread */}
      <div
        ref={scrollRef}
        className="sb-scroll"
        style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {empty && (
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.65, color: 'var(--t2)' }}>
            {needsNote ? 'Open a note first — this tab works on whatever you have open.' : copy.intro}
          </p>
        )}

        {mode === 'study' && topic && empty && (
          <div style={{ fontSize: 10, color: 'var(--t3)' }}>
            studying: <span style={{ color: 'var(--acc2)' }}>{topic}</span>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div
              key={i}
              style={{
                alignSelf: 'flex-end',
                maxWidth: '92%',
                padding: '7px 10px',
                background: 'var(--acc-bg)',
                border: '1px solid var(--acc-bd)',
                borderRadius: 6,
                color: 'var(--t1)',
                fontSize: 11.5,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content}
            </div>
          ) : (
            <div key={i}>
              <StudyMarkdown content={m.content} />

              {m.sources && m.sources.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {m.sources.map((s) => (
                    <button
                      key={s}
                      onClick={() => onOpenNoteByTitle?.(s)}
                      title={`open ${s}`}
                      style={{
                        fontSize: 9.5,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'var(--bg3)',
                        border: '1px solid var(--bd)',
                        color: 'var(--t3)',
                        fontFamily: 'inherit',
                        cursor: onOpenNoteByTitle ? 'pointer' : 'default',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--acc2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t3)')}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  onClick={() => save(m, i)}
                  title="Save this to your note (select text first to save just that)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 9.5,
                    padding: '3px 7px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: savedIdx === i ? 'var(--grn-bg)' : 'transparent',
                    border: '1px solid ' + (savedIdx === i ? 'var(--grn-bd)' : 'var(--bd)'),
                    color: savedIdx === i ? 'var(--grn)' : 'var(--t3)',
                  }}
                  onMouseEnter={(e) => {
                    if (savedIdx !== i) e.currentTarget.style.color = 'var(--acc2)';
                  }}
                  onMouseLeave={(e) => {
                    if (savedIdx !== i) e.currentTarget.style.color = 'var(--t3)';
                  }}
                >
                  {savedIdx === i ? (
                    <>
                      <Check size={10} /> saved
                    </>
                  ) : (
                    <>
                      <BookmarkPlus size={10} /> save to note
                    </>
                  )}
                </button>
              </div>
            </div>
          ),
        )}

        {loading && (
          <div
            style={{
              alignSelf: 'flex-start',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 10.5,
              color: 'var(--t3)',
            }}
          >
            <Loader2 size={11} className="sb-spin" /> thinking…
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '7px 10px',
              background: 'var(--red-bg)',
              border: '1px solid var(--red)',
              borderRadius: 4,
              color: 'var(--red)',
              fontSize: 10.5,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Starters — only while the thread is empty, so they never crowd a conversation */}
      {empty && !needsNote && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingTop: 10 }}>
          {copy.starters.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              style={{
                padding: '5px 9px',
                background: 'var(--bg2)',
                border: '1px solid var(--bd)',
                borderRadius: 5,
                color: 'var(--t2)',
                fontSize: 10.5,
                fontFamily: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--acc)';
                e.currentTarget.style.color = 'var(--t1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--bd)';
                e.currentTarget.style.color = 'var(--t2)';
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', paddingTop: 10 }}>
        <textarea
          ref={inputRef}
          value={input}
          disabled={needsNote}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={mode === 'study' ? 'answer, or ask the tutor…' : 'Ask…'}
          rows={1}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--bg2)',
            border: '1px solid var(--bd2)',
            borderRadius: 5,
            padding: '7px 9px',
            color: 'var(--t1)',
            fontSize: 11.5,
            fontFamily: 'inherit',
            outline: 'none',
            resize: 'none',
            minHeight: 32,
            maxHeight: 110,
            caretColor: 'var(--acc2)',
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading || needsNote}
          aria-label="send"
          title="Send (Enter)"
          style={{
            width: 32,
            height: 32,
            flexShrink: 0,
            background: input.trim() && !loading ? 'var(--acc)' : 'var(--bg2)',
            color: input.trim() && !loading ? '#fff' : 'var(--t3)',
            border: '1px solid ' + (input.trim() && !loading ? 'var(--acc)' : 'var(--bd2)'),
            borderRadius: 5,
            cursor: input.trim() && !loading ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {input.trim() && !loading ? <Send size={12} /> : <CornerDownLeft size={12} />}
        </button>
      </div>
    </div>
  );
}
