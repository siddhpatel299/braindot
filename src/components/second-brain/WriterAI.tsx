'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, X, Loader2, Wand2, ListChecks, Maximize2, List,
  Send, Check, Copy, RefreshCw, AlertCircle,
} from 'lucide-react';
import { streamAsk } from '@/lib/aiClient';

interface WriterAIProps {
  // Ref to the main editor textarea (may be null when note has embeds —
  // in that case we fall back to the currently focused .sb-editor-textarea).
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  body: string;
  onBodyChange: (next: string) => void;
  noteTitle: string;
  noteTags: string[];
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  prompt: string;
  hint: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'improve',
    label: 'improve',
    icon: Wand2,
    hint: 'Rewrite the selection (or whole note) to be clearer and tighter',
    prompt:
      'Improve the writing of the text below. Make it clearer, more concise, and more engaging. Preserve the original meaning and any markdown formatting. Return ONLY the rewritten text in markdown — no explanations, no preamble.',
  },
  {
    id: 'summarize',
    label: 'summarize',
    icon: ListChecks,
    hint: 'Distill the key points into a 3–5 bullet list',
    prompt:
      'Summarize the key points of the text below as a concise markdown bullet list (3–5 bullets, each one line). Return ONLY the bullet list — no preamble.',
  },
  {
    id: 'expand',
    label: 'expand',
    icon: Maximize2,
    hint: 'Add depth, examples, and reasoning',
    prompt:
      'Expand on the ideas in the text below with more depth, concrete examples, and reasoning. Keep the same voice. Return ONLY the expanded text in markdown — no explanations.',
  },
  {
    id: 'format',
    label: 'bullets',
    icon: List,
    hint: 'Reformat as a clean markdown bullet list',
    prompt:
      'Reformat the text below as a clean, well-structured markdown bullet list. Group related points under bold sub-headings if useful. Return ONLY the formatted list — no preamble.',
  },
];

const FONT_SIZE = 11;

export function WriterAI({ textareaRef, body, onBodyChange, noteTitle, noteTags }: WriterAIProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [copied, setCopied] = useState(false);

  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  // Pending cursor restore after body prop updates from an insert.
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  // Resolve the active textarea — same pattern as FormattingToolbar.
  // Supports the segment-editor (embeds) case by falling back to the
  // currently focused .sb-editor-textarea.
  const getActiveTextarea = useCallback((): HTMLTextAreaElement | null => {
    if (textareaRef.current) return textareaRef.current;
    const active = document.activeElement;
    if (active && active.tagName === 'TEXTAREA' && active.classList.contains('sb-editor-textarea')) {
      return active as HTMLTextAreaElement;
    }
    return document.querySelector('.sb-editor-textarea');
  }, [textareaRef]);

  // Restore selection after body prop updates (mirrors FormattingToolbar pattern).
  useEffect(() => {
    if (pendingSelection.current) {
      const ta = getActiveTextarea();
      if (ta) {
        ta.selectionStart = pendingSelection.current.start;
        ta.selectionEnd = pendingSelection.current.end;
        ta.focus();
      }
      pendingSelection.current = null;
    }
  }, [body, getActiveTextarea]);

  // Open the panel — capture anchor position and current text selection.
  const handleOpen = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const panelWidth = 340;
      const left = Math.max(8, Math.min(window.innerWidth - panelWidth - 8, rect.right - panelWidth));
      // The trigger sits low on the page, so the panel opens upward whenever
      // there is not room below it — matching the maxHeight the panel uses.
      const panelHeight = Math.min(window.innerHeight * 0.7, 560);
      const below = rect.bottom + 6;
      const top = below + panelHeight > window.innerHeight - 8
        ? Math.max(8, rect.top - panelHeight - 6)
        : below;
      setPanelPos({ top, left });
    }
    const ta = getActiveTextarea();
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selText = body.slice(start, end);
      if (selText.trim().length > 0) {
        setSelection({ start, end, text: selText });
      } else {
        setSelection(null);
      }
    } else {
      setSelection(null);
    }
    setResponse(null);
    setError(null);
    setPrompt('');
    setOpen(true);
    requestAnimationFrame(() => promptInputRef.current?.focus());
  }, [getActiveTextarea, body]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setResponse(null);
    setError(null);
    setPrompt('');
    setSelection(null);
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        btnRef.current && !btnRef.current.contains(target)
      ) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open, handleClose]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, handleClose]);

  // Core: stream the prompt through /api/ai/ask with the note body +
  // selection as context. Tokens render into the response box as they arrive.
  const generate = useCallback(async (promptText: string) => {
    if (!promptText.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const selText = selection?.text || '';
      const fullPrompt = selText
        ? `${promptText}\n\n--- TEXT TO PROCESS ---\n${selText}\n--- END TEXT ---`
        : `${promptText}\n\n--- FULL NOTE (for context) ---\n${body || '(empty note)'}\n--- END ---`;

      const full = await streamAsk(
        {
          noteTitle,
          noteBody: body,
          noteTags,
          question: fullPrompt,
          scope: 'note',
        },
        (text) => {
          setLoading(false);
          setResponse(text);
        },
      );
      if (!full) setResponse('(no response)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [loading, selection, body, noteTitle, noteTags]);

  // Insert the AI response at the cursor — replaces the selection if we
  // captured one when opening, otherwise inserts at the cursor position.
  const insertResponse = useCallback(() => {
    if (!response) return;
    const ta = getActiveTextarea();
    // If there's no textarea (rare), append to end of body.
    if (!ta) {
      const suffix = body.length > 0 && !body.endsWith('\n') ? '\n\n' : '';
      onBodyChange(body + suffix + response);
      handleClose();
      return;
    }

    // Re-read the current selection from the textarea — it may have moved
    // since the panel was opened (user could have clicked elsewhere first).
    // But prefer the captured selection if it was non-empty (the user opened
    // the panel specifically to act on that text).
    const hasCapturedSel = selection !== null && selection.text.trim().length > 0;
    const start = hasCapturedSel ? selection!.start : ta.selectionStart;
    const end = hasCapturedSel ? selection!.end : ta.selectionEnd;

    let inserted: string;
    if (hasCapturedSel) {
      // Replace selection with the response verbatim.
      inserted = response;
    } else {
      // Insert at cursor — pad with blank lines so it doesn't merge with
      // neighbouring paragraphs.
      const before = body.slice(0, start);
      const after = body.slice(end);
      const needsLeadingNL = before.length > 0 && !before.endsWith('\n');
      const needsTrailingNL = after.length > 0 && !after.startsWith('\n');
      inserted = (needsLeadingNL ? '\n\n' : '') + response + (needsTrailingNL ? '\n\n' : '');
    }

    const next = body.slice(0, start) + inserted + body.slice(end);
    const newCursor = start + inserted.length;
    pendingSelection.current = { start: newCursor, end: newCursor };
    onBodyChange(next);
    handleClose();
  }, [response, getActiveTextarea, selection, body, onBodyChange, handleClose]);

  const handleQuickAction = useCallback((action: QuickAction) => {
    void generate(action.prompt);
  }, [generate]);

  const handleGenerateCustom = useCallback(() => {
    void generate(prompt);
  }, [generate, prompt]);

  const handleCopy = useCallback(async () => {
    if (!response) return;
    try {
      await navigator.clipboard?.writeText(response);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable — ignore */
    }
  }, [response]);

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerateCustom();
    }
  };

  // The trigger floats over the bottom-right corner of the writing surface.
  // It used to be an in-flow button below the editor, which cost every note
  // 28px of height for a control the writer only reaches for occasionally —
  // and left a stray strip under the page. Floating, it costs nothing.
  const triggerBtn = (
    <button
      ref={btnRef}
      type="button"
      onClick={open ? handleClose : handleOpen}
      title="AI writing assistant"
      aria-expanded={open}
      style={{
        position: 'absolute',
        right: 18,
        bottom: 16,
        zIndex: 20,
        height: 28,
        padding: '0 11px',
        borderRadius: 14,
        background: open ? 'var(--acc-bg)' : 'var(--bg2)',
        border: `1px solid ${open ? 'var(--acc)' : 'var(--bd2)'}`,
        color: open ? 'var(--acc2)' : 'var(--t2)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        fontFamily: 'inherit',
        fontWeight: 600,
        flexShrink: 0,
        transition: 'background 0.1s, color 0.1s, border 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!open) {
          e.currentTarget.style.background = 'var(--bg3)';
          e.currentTarget.style.color = 'var(--t1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!open) {
          e.currentTarget.style.background = 'var(--bg2)';
          e.currentTarget.style.color = 'var(--t2)';
        }
      }}
    >
      <Sparkles size={13} color="var(--acc2)" />
      write
    </button>
  );

  return (
    <>
      {triggerBtn}
      {open && (
        <div
          ref={panelRef}
          className="sb-fade-in"
          style={{
            position: 'fixed',
            top: panelPos.top,
            left: panelPos.left,
            width: 340,
            maxWidth: 'calc(100vw - 16px)',
            background: 'var(--bg2)',
            border: '1px solid var(--bd2)',
            borderRadius: 6,
            boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,110,247,0.08)',
            zIndex: 300,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            maxHeight: 'min(70vh, 560px)',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '9px 12px',
            borderBottom: '1px solid var(--bd)',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            flexShrink: 0,
          }}>
            <Sparkles size={12} color="var(--acc2)" />
            <span style={{ fontSize: 11, color: 'var(--t1)', fontWeight: 600, flex: 1 }}>
              content writer
            </span>
            {selection && (
              <span style={{
                fontSize: 9, color: 'var(--acc2)', background: 'var(--acc-bg)',
                border: '1px solid #3d378a', padding: '2px 6px', borderRadius: 3,
                textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
              }} title={`${selection.text.length} chars selected`}>
                {selection.text.length} chars
              </span>
            )}
            <button
              onClick={handleClose}
              title="Close (Esc)"
              style={{
                width: 20, height: 20, borderRadius: 3, background: 'transparent',
                border: 'none', color: 'var(--t3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={13} />
            </button>
          </div>

          {/* Body — scrollable */}
          <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Context note */}
            <div style={{
              fontSize: 9, color: 'var(--t3)', fontStyle: 'italic',
              padding: '0 2px',
            }}>
              {selection
                ? `> acting on ${selection.text.length} chars of selected text — response will replace it.`
                : `> using the full note as context — response will insert at cursor.`}
            </div>

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => handleQuickAction(action)}
                    disabled={loading}
                    title={action.hint}
                    style={{
                      padding: '7px 8px',
                      background: 'var(--bg3)',
                      border: '1px solid var(--bd)',
                      borderRadius: 4,
                      color: 'var(--t2)',
                      fontSize: 10,
                      fontFamily: 'inherit',
                      cursor: loading ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      transition: 'background 0.1s, border 0.1s, color 0.1s',
                      opacity: loading ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) {
                        e.currentTarget.style.background = 'var(--acc-bg)';
                        e.currentTarget.style.borderColor = 'var(--acc)';
                        e.currentTarget.style.color = 'var(--acc2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loading) {
                        e.currentTarget.style.background = 'var(--bg3)';
                        e.currentTarget.style.borderColor = 'var(--bd)';
                        e.currentTarget.style.color = 'var(--t2)';
                      }
                    }}
                  >
                    <Icon size={11} />
                    {action.label}
                  </button>
                );
              })}
            </div>

            {/* Custom prompt input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <textarea
                ref={promptInputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder="custom prompt — e.g. 'add a conclusion paragraph' or 'continue writing about X'"
                rows={2}
                disabled={loading}
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--bd2)',
                  borderRadius: 4,
                  padding: '7px 9px',
                  color: 'var(--t1)',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'none',
                  caretColor: 'var(--acc2)',
                  lineHeight: 1.5,
                }}
              />
              <button
                onClick={handleGenerateCustom}
                disabled={!prompt.trim() || loading}
                style={{
                  height: 28,
                  background: prompt.trim() && !loading ? 'var(--acc)' : 'var(--bg3)',
                  color: prompt.trim() && !loading ? '#fff' : 'var(--t3)',
                  border: '1px solid ' + (prompt.trim() && !loading ? 'var(--acc)' : 'var(--bd2)'),
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: 'inherit',
                  cursor: prompt.trim() && !loading ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  fontWeight: 600,
                }}
              >
                {loading ? <Loader2 size={12} className="sb-spin" /> : <Send size={11} />}
                {loading ? 'generating…' : 'generate'}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding: '8px 10px',
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid var(--red)',
                borderRadius: 4,
                color: 'var(--red)',
                fontSize: 10,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                lineHeight: 1.5,
              }}>
                <AlertCircle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Response preview */}
            {response && (
              <div style={{
                border: '1px solid var(--bd)',
                borderRadius: 4,
                background: 'var(--bg1)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{
                  padding: '5px 9px',
                  fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'var(--acc2)', fontWeight: 600,
                  borderBottom: '1px solid var(--bd)',
                  background: 'var(--acc-bg)',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <Sparkles size={9} /> AI response
                </div>
                <div className="sb-scroll" style={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  padding: '9px 11px',
                  fontSize: FONT_SIZE,
                  color: 'var(--t2)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {response}
                </div>
                <div style={{
                  display: 'flex',
                  gap: 5,
                  padding: '6px 8px',
                  borderTop: '1px solid var(--bd)',
                  background: 'var(--bg2)',
                }}>
                  <button
                    onClick={insertResponse}
                    style={{
                      flex: 1,
                      height: 26,
                      background: 'var(--acc)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 3,
                      fontSize: 10,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      fontWeight: 600,
                    }}
                  >
                    <Check size={11} />
                    {selection ? 'replace selection' : 'insert at cursor'}
                  </button>
                  <button
                    onClick={handleCopy}
                    title="Copy to clipboard"
                    style={{
                      width: 26, height: 26,
                      background: 'var(--bg3)', color: copied ? 'var(--grn)' : 'var(--t3)',
                      border: '1px solid var(--bd2)', borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {copied ? <Check size={11} /> : <Copy size={11} />}
                  </button>
                  <button
                    onClick={() => prompt.trim() ? handleGenerateCustom() : null}
                    disabled={loading || !prompt.trim()}
                    title="Regenerate with same prompt"
                    style={{
                      width: 26, height: 26,
                      background: 'var(--bg3)', color: 'var(--t3)',
                      border: '1px solid var(--bd2)', borderRadius: 3,
                      cursor: loading || !prompt.trim() ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: loading || !prompt.trim() ? 0.5 : 1,
                    }}
                  >
                    <RefreshCw size={11} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div style={{
            padding: '5px 12px',
            borderTop: '1px solid var(--bd)',
            fontSize: 9, color: 'var(--t3)', fontStyle: 'italic',
            background: 'var(--bg1)', flexShrink: 0,
          }}>
            esc to close · enter to generate · shift+enter for newline
          </div>
          <style>{`
            @keyframes sb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .sb-spin { animation: sb-spin 1s linear infinite; }
          `}</style>
        </div>
      )}
    </>
  );
}
