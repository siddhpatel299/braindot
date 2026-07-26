'use client';

import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { Note, TAG_COLORS } from '@/types';
import { renderMarkdownOverlay, formatDate, countWords } from '@/utils/markdown';
import { getCaretCoordinates, clampToViewport } from '@/utils/caret';
import { htmlToMarkdown, looksLikeRichHtml } from '@/utils/htmlToMarkdown';
import { computeLineDiff, diffStats } from '@/utils/diff';
import { useEditor } from '@/hooks/useEditor';
import { ArrowLeft, RefreshCw, Eye, Pencil, GitCompare, Undo2, Redo2, Trash2, Type, Check } from 'lucide-react';
import { FormattingToolbar } from './FormattingToolbar';
import { WriterAI } from './WriterAI';
import { SlashMenu, SlashCommand } from './SlashMenu';
import { Mermaid } from './Mermaid';
import { isMermaidLang, normalizeMermaidSource } from '@/utils/mermaid';
import { useEditorFont, EDITOR_FONT_OPTIONS } from '@/hooks/useEditorFont';

// Split a markdown body into prose vs. diagram segments so the preview can
// render diagrams as SVG while keeping the existing HTML renderer for
// everything else. Accepts ```mermaid as well as type-named fences the AI
// commonly emits (```gantt, ```timeline, ```flowchart…).
function splitMermaidBlocks(body: string): { type: 'text' | 'mermaid'; content: string }[] {
  const re = /```([\w-]*)\s*\n([\s\S]*?)```/g;
  const out: { type: 'text' | 'mermaid'; content: string }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const lang = m[1];
    if (!isMermaidLang(lang)) continue; // ordinary code block → leave to the HTML renderer
    if (m.index > last) out.push({ type: 'text', content: body.slice(last, m.index) });
    out.push({ type: 'mermaid', content: normalizeMermaidSource(lang, m[2]) });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ type: 'text', content: body.slice(last) });
  return out.length ? out : [{ type: 'text', content: body }];
}

type ViewMode = 'edit' | 'preview' | 'diff';

// Simple markdown-to-HTML for preview mode
function renderMarkdownHtml(body: string): string {
  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = body.split('\n');
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, '').trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const langLabel = lang ? `<div style="font-size:10px;text-transform:uppercase;color:var(--t3);margin-bottom:6px;font-weight:600">${escapeHtml(lang)}</div>` : '';
      blocks.push(`<pre style="background:var(--bg1);border:1px solid var(--bd);border-radius:5px;padding:12px 14px;margin:12px 0;overflow-x:auto"><code style="color:var(--grn);font-size:13px;white-space:pre">${langLabel}${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Callout
    const calloutMatch = line.match(/^>\s*\[!([^\]]+)\]/);
    if (calloutMatch) {
      const calloutType = calloutMatch[1].toLowerCase();
      const calloutBody: string[] = [];
      const rest = line.replace(/^>\s*\[![^\]]+\]\s*/, '');
      if (rest.trim()) calloutBody.push(rest);
      i++;
      while (i < lines.length && /^>/.test(lines[i])) {
        calloutBody.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(`<div style="background:var(--acc-bg);border-left:3px solid var(--acc);border-radius:0 5px 5px 0;padding:10px 14px;margin:12px 0"><div style="font-size:10px;text-transform:uppercase;color:var(--acc2);font-weight:600;margin-bottom:4px">${escapeHtml(calloutType)}</div><div style="color:#9994cc;font-size:13px">${calloutBody.map(l => renderInline(l)).join('<br/>')}</div></div>`);
      continue;
    }

    // Blockquote
    if (/^>\s/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(`<blockquote style="border-left:3px solid var(--bd2);padding-left:14px;margin:12px 0;color:var(--t3);font-style:italic">${quoteLines.map(l => `<p>${renderInline(l)}</p>`).join('')}</blockquote>`);
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = renderInline(hMatch[2]);
      const sizes = ['22px', '18px', '16px', '15px', '14px', '13px'];
      const topMargin = level <= 2 ? '16px' : '12px';
      blocks.push(`<h${level} style="font-size:${sizes[level-1]};font-weight:700;color:var(--t1);margin-top:${topMargin};margin-bottom:8px;letter-spacing:-0.01em">${text}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line) || /^\*\*\*+\s*$/.test(line)) {
      blocks.push('<hr style="border:none;border-top:1px solid var(--bd);margin:12px 0" />');
      i++;
      continue;
    }

    // Bullet list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(`<li style="list-style:none;position:relative;padding-left:14px;margin-bottom:4px">${renderInline(lines[i].replace(/^\s*[-*+]\s+/, ''))}<span style="position:absolute;left:0;color:var(--t3)">—</span></li>`);
        i++;
      }
      blocks.push(`<ul style="margin:0 0 14px;padding-left:0">${items.join('')}</ul>`);
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li style="margin-bottom:4px">${renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i++;
      }
      blocks.push(`<ol style="margin:0 0 14px;padding-left:24px">${items.join('')}</ol>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') { i++; continue; }

    // Paragraph
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^#{1,6}\s/.test(lines[i]) && !/^```/.test(lines[i]) && !/^>\s/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^---+\s*$/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(`<p style="margin:0 0 14px">${paraLines.map(l => renderInline(l)).join('<br/>')}</p>`);
    }
  }

  return `<div style="font-family:'JetBrains Mono',monospace;font-size:14px;line-height:1.8;color:var(--t2)">${blocks.join('\n')}</div>`;
}

// Preview inline rendering — unlike the edit overlay, this STRIPS the markdown
// markers (** * ~~ ` [[ ]]) and shows only the formatted result.
function renderInline(s: string): string {
  let out = escapeHtml(s);
  // wiki-links: show the title only, clickable (title kept in data-wiki)
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_m, p1) => `<a data-wiki="${escapeHtml(p1)}" style="color:var(--acc2);text-decoration:underline;text-underline-offset:2px;cursor:pointer">${escapeHtml(p1)}</a>`);
  // inline code
  out = out.replace(/`([^`\n]+)`/g, '<code style="background:var(--bg3);color:var(--grn);padding:1px 6px;border-radius:3px;font-size:0.9em;border:1px solid var(--bd)">$1</code>');
  // bold, then strikethrough, then underline, then italic — markers removed
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--t1);font-weight:700">$1</strong>');
  out = out.replace(/~~([^~\n]+)~~/g, '<del style="color:var(--t3)">$1</del>');
  out = out.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u>$1</u>');
  out = out.replace(/(^|[^*_])\*([^*\n]+)\*(?!\*)/g, '$1<em style="color:var(--acc2);font-style:italic">$2</em>');
  out = out.replace(/(^|[^*_])_([^_\n]+)_(?!_)/g, '$1<em style="color:var(--acc2);font-style:italic">$2</em>');
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

interface EditorCanvasProps {
  note: Note;
  allNotes: Note[];
  dirty: boolean;
  editor: ReturnType<typeof useEditor>;
  onSave: (id: string, patch: Partial<Note>) => void;
  onOpenNote: (id: string) => void;
  onOpenNoteByTitle: (title: string) => void;
  onToggleEvergreen: (id: string) => void;
  onDeleteNote?: (id: string) => void;
}

export function EditorCanvas({
  note,
  allNotes,
  dirty,
  editor,
  onSave,
  onOpenNote,
  onOpenNoteByTitle,
  onToggleEvergreen,
  onDeleteNote,
}: EditorCanvasProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const { font: editorFont, setFont: setEditorFont } = useEditorFont();
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashPos, setSlashPos] = useState<{ x: number; y: number } | null>(null);

  // Wiki-link autocomplete: opens while typing "[[…" and lists note titles
  const [linkAuto, setLinkAuto] = useState<{ start: number; query: string } | null>(null);
  const [linkPos, setLinkPos] = useState<{ x: number; y: number } | null>(null);
  const [linkSel, setLinkSel] = useState(0);

  // Preview: split into prose + mermaid-diagram segments
  const previewSegments = useMemo(() => splitMermaidBlocks(editor.body), [editor.body]);

  // Diff: compare saved body (note.body) with working body (editor.body)
  const diffLines = useMemo(() => computeLineDiff(note.body, editor.body), [note.body, editor.body]);
  const stats = useMemo(() => diffStats(note.body, editor.body), [note.body, editor.body]);

  // This is a writing-first app: stay in the mode the user chose instead of
  // flipping back to preview on every note open. The last chosen mode
  // (edit/preview) is restored across sessions; diff is always transient.
  useEffect(() => {
    const saved = localStorage.getItem('sb-editor-mode');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === 'preview' || saved === 'edit') setViewMode(saved);
  }, []);

  const changeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (mode !== 'diff') localStorage.setItem('sb-editor-mode', mode);
  }, []);

  // Auto-resize textarea to match content height
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, []);

  useEffect(() => {
    autoResize();
    // A proportional font reflows the text to a different height, so the
    // textarea box must be re-measured or it keeps the old (taller) height
    // and leaves a dead click-zone below the prose.
  }, [editor.body, note?.id, autoResize, editorFont, viewMode]);

  // Re-measure on window resize
  useEffect(() => {
    const handler = () => autoResize();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [autoResize]);

  // Render markdown to HTML overlay
  const overlayHtml = useMemo(() => renderMarkdownOverlay(editor.body), [editor.body]);

  // Wiki-link click handling: clicks pass through the transparent textarea
  // only when the underlying <pre> has a data-wiki span at that location.
  // Approach: handle clicks on the <pre> itself, but since textarea is on top,
  // we use mousedown coordinates to detect wiki-link targets by walking the
  // overlay DOM. To keep this simple, we add a click handler on the wrap and
  // check the underlying element via document.elementFromPoint.
  const handleWrapClick = useCallback(
    (e: React.MouseEvent) => {
      // Only intercept if user wasn't selecting text
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;
      // Only intercept Ctrl/Cmd-click to open wiki-link, so normal clicks
      // place the caret as expected.
      if (!e.metaKey && !e.ctrlKey) return;

      const target = e.target as HTMLElement;
      // Hide textarea temporarily to get element under cursor
      const ta = textareaRef.current;
      if (!ta) return;
      const prevPointer = ta.style.pointerEvents;
      ta.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      ta.style.pointerEvents = prevPointer;

      const wikiEl = el?.closest('[data-wiki]') as HTMLElement | null;
      if (wikiEl) {
        const title = wikiEl.getAttribute('data-wiki');
        if (title) {
          e.preventDefault();
          onOpenNoteByTitle(title);
        }
      }
    },
    [onOpenNoteByTitle],
  );

  const wrapSelection = useCallback(
    (prefix: string, suffix: string, placeholder: string = 'text') => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = editor.body.slice(start, end);
      const text = selected || placeholder;
      const inserted = prefix + text + suffix;
      const next = editor.body.slice(0, start) + inserted + editor.body.slice(end);
      editor.updateBody(next);
      setTimeout(() => {
        ta.focus();
        if (selected) {
          ta.selectionStart = start;
          ta.selectionEnd = start + inserted.length;
        } else {
          ta.selectionStart = start + prefix.length;
          ta.selectionEnd = start + prefix.length + placeholder.length;
        }
      }, 0);
    },
    [editor],
  );

  // Slash commands for the / menu
  const slashCommands: SlashCommand[] = useMemo(() => {
    const insertAtCursor = (text: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const next = editor.body.slice(0, start) + text + editor.body.slice(ta.selectionEnd);
      editor.updateBody(next);
      setTimeout(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + text.length;
      }, 0);
    };
    return [
      {
        id: 'h1', label: 'Heading 1', description: 'Large section heading',
        icon: ({ size }) => <span style={{ fontSize: size || 14, fontWeight: 700 }}>H1</span>,
        action: () => insertAtCursor('\n# '),
      },
      {
        id: 'h2', label: 'Heading 2', description: 'Medium section heading',
        icon: ({ size }) => <span style={{ fontSize: size || 14, fontWeight: 700 }}>H2</span>,
        action: () => insertAtCursor('\n## '),
      },
      {
        id: 'h3', label: 'Heading 3', description: 'Small section heading',
        icon: ({ size }) => <span style={{ fontSize: size || 14, fontWeight: 700 }}>H3</span>,
        action: () => insertAtCursor('\n### '),
      },
      {
        id: 'callout', label: 'Callout', description: 'Highlighted note block',
        icon: ({ size }) => <span style={{ fontSize: size || 14 }}>📌</span>,
        action: () => insertAtCursor('\n> [!callout]\n> '),
      },
      {
        id: 'code', label: 'Code block', description: 'Fenced code block',
        icon: ({ size }) => <span style={{ fontSize: size || 14 }}>⌘</span>,
        action: () => insertAtCursor('\n```\n\n```\n'),
      },
      {
        id: 'quote', label: 'Quote', description: 'Blockquote',
        icon: ({ size }) => <span style={{ fontSize: size || 14 }}>❝</span>,
        action: () => insertAtCursor('\n> '),
      },
      {
        id: 'bullet', label: 'Bullet list', description: 'Unordered list',
        icon: ({ size }) => <span style={{ fontSize: size || 14 }}>•</span>,
        action: () => insertAtCursor('\n- '),
      },
      {
        id: 'numbered', label: 'Numbered list', description: 'Ordered list',
        icon: ({ size }) => <span style={{ fontSize: size || 14 }}>1.</span>,
        action: () => insertAtCursor('\n1. '),
      },
      {
        id: 'hr', label: 'Divider', description: 'Horizontal rule',
        icon: ({ size }) => <span style={{ fontSize: size || 14 }}>―</span>,
        action: () => insertAtCursor('\n---\n'),
      },
      {
        id: 'wikilink', label: 'Wiki-link', description: 'Link to another note',
        icon: ({ size }) => <span style={{ fontSize: size || 14 }}>🔗</span>,
        action: () => insertAtCursor('[['),
      },
      {
        id: 'table', label: 'Table', description: 'Insert a 3-column table',
        icon: ({ size }) => <span style={{ fontSize: size || 14 }}>▦</span>,
        action: () => insertAtCursor('\n| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell | Cell | Cell |\n'),
      },
      {
        id: 'todo', label: 'Todo list', description: 'Checkbox todo items',
        icon: ({ size }) => <span style={{ fontSize: size || 14 }}>☑</span>,
        action: () => insertAtCursor('\n- [ ] '),
      },
    ];
  }, [editor]);

  // ---- Wiki-link autocomplete ----
  const linkMatches = useMemo(() => {
    if (!linkAuto) return [];
    const q = linkAuto.query.toLowerCase();
    return allNotes
      .filter((n) => n.id !== note.id && n.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [linkAuto, allNotes, note.id]);

  const closeLinkAuto = useCallback(() => {
    setLinkAuto(null);
    setLinkSel(0);
  }, []);

  // Detect an unclosed "[[query" immediately before the caret
  const detectLinkAuto = useCallback((val: string, caret: number, ta: HTMLTextAreaElement) => {
    const before = val.slice(0, caret);
    const openIdx = before.lastIndexOf('[[');
    if (openIdx >= 0) {
      const between = before.slice(openIdx + 2);
      if (!between.includes(']]') && !between.includes('\n') && between.length <= 60) {
        setLinkAuto({ start: openIdx + 2, query: between });
        setLinkSel(0);
        setLinkPos(clampToViewport(getCaretCoordinates(ta, caret), 280, 240));
        return;
      }
    }
    closeLinkAuto();
  }, [closeLinkAuto]);

  const handleBodyChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    editor.updateBody(val);
    detectLinkAuto(val, e.target.selectionStart, e.target);
  }, [editor, detectLinkAuto]);

  const selectWikiLink = useCallback((title: string) => {
    const ta = textareaRef.current;
    if (!ta || !linkAuto) return;
    const caret = ta.selectionStart;
    // Skip over a "]]" the user may already have typed after the caret
    const after = editor.body.slice(caret);
    const closing = after.startsWith(']]') ? 2 : 0;
    const next = editor.body.slice(0, linkAuto.start) + title + ']]' + editor.body.slice(caret + closing);
    editor.updateBody(next);
    const newPos = linkAuto.start + title.length + 2;
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = newPos;
    }, 0);
    closeLinkAuto();
  }, [editor, linkAuto, closeLinkAuto]);

  // Paste rich web content as Markdown. When the clipboard carries HTML with
  // real structure, convert it; otherwise let the browser paste plain text.
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const html = e.clipboardData.getData('text/html');
      if (!html || !looksLikeRichHtml(html)) return; // plain text / copied markdown → default
      const md = htmlToMarkdown(html);
      if (!md) return;
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = editor.body.slice(0, start);
      const after = editor.body.slice(end);
      // Pad so the pasted block doesn't fuse with surrounding text
      const lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
      const trail = after && !after.startsWith('\n') ? '\n' : '';
      const next = before + lead + md + trail + after;
      editor.updateBody(next);
      const pos = start + lead.length + md.length;
      setTimeout(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = pos;
      }, 0);
    },
    [editor],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const meta = e.metaKey || e.ctrlKey;

      // Wiki-link autocomplete captures navigation keys while open
      if (linkAuto && linkMatches.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setLinkSel((s) => Math.min(s + 1, linkMatches.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setLinkSel((s) => Math.max(s - 1, 0));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          selectWikiLink(linkMatches[linkSel]?.title ?? linkMatches[0].title);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeLinkAuto();
          return;
        }
      } else if (linkAuto && e.key === 'Escape') {
        e.preventDefault();
        closeLinkAuto();
        return;
      }

      // Undo/redo
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        editor.undo();
        return;
      }
      if (meta && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        editor.redo();
        return;
      }

      // Continue lists on Enter: "- ", "* ", "1. ", "- [ ] ", "> "
      if (e.key === 'Enter' && !e.shiftKey && !meta) {
        const ta = e.currentTarget;
        const pos = ta.selectionStart;
        if (pos === ta.selectionEnd) {
          const lineStart = editor.body.lastIndexOf('\n', pos - 1) + 1;
          const line = editor.body.slice(lineStart, pos);
          const m = line.match(/^(\s*)(- \[[ xX]\] |[-*+] |(\d+)\. |> )/);
          if (m) {
            e.preventDefault();
            const content = line.slice(m[0].length);
            if (!content.trim()) {
              // Empty item → end the list (remove the marker)
              const next = editor.body.slice(0, lineStart) + editor.body.slice(pos);
              editor.updateBody(next);
              setTimeout(() => {
                ta.focus();
                ta.selectionStart = ta.selectionEnd = lineStart;
              }, 0);
            } else {
              const marker = m[3]
                ? `${m[1]}${parseInt(m[3], 10) + 1}. `
                : m[2].startsWith('- [')
                  ? `${m[1]}- [ ] `
                  : `${m[1]}${m[2]}`;
              const inserted = '\n' + marker;
              const next = editor.body.slice(0, pos) + inserted + editor.body.slice(ta.selectionEnd);
              editor.updateBody(next);
              setTimeout(() => {
                ta.focus();
                ta.selectionStart = ta.selectionEnd = pos + inserted.length;
              }, 0);
            }
            return;
          }
        }
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const next = editor.body.slice(0, start) + '  ' + editor.body.slice(end);
        editor.updateBody(next);
        setTimeout(() => {
          ta.focus();
          ta.selectionStart = ta.selectionEnd = start + 2;
        }, 0);
        return;
      }

      // Slash menu detection — open when user types / at start of line or after space
      if (e.key === '/' && !slashOpen && !linkAuto) {
        const ta = e.currentTarget;
        const pos = ta.selectionStart;
        const charBefore = pos > 0 ? editor.body[pos - 1] : '\n';
        if (charBefore === '\n' || charBefore === ' ' || pos === 0) {
          // Anchor the menu at the caret, not a fixed corner
          setSlashPos(clampToViewport(getCaretCoordinates(ta, pos), 280, 280));
          setSlashOpen(true);
        }
      }
      // Close slash menu on Escape
      if (e.key === 'Escape' && slashOpen) {
        setSlashOpen(false);
      }

      // Formatting shortcuts
      if (meta && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        wrapSelection('**', '**', 'bold text');
      } else if (meta && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        wrapSelection('*', '*', 'italic text');
      } else if (meta && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        wrapSelection('<u>', '</u>', 'underlined');
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'k') {
        // Cmd+Shift+K — inline code (Cmd+K alone is the command palette)
        e.preventDefault();
        wrapSelection('`', '`', 'code');
      }
    },
    [editor, wrapSelection, slashOpen, linkAuto, linkMatches, linkSel, selectWikiLink, closeLinkAuto],
  );

  // Handle slash command selection
  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    setSlashOpen(false);
    // Remove the / that triggered the menu
    const ta = textareaRef.current;
    if (ta) {
      const pos = ta.selectionStart;
      if (editor.body[pos - 1] === '/') {
        const next = editor.body.slice(0, pos - 1) + editor.body.slice(pos);
        editor.updateBody(next);
        setTimeout(() => {
          ta.focus();
          ta.selectionStart = ta.selectionEnd = pos - 1;
          cmd.action();
        }, 0);
      } else {
        cmd.action();
      }
    } else {
      cmd.action();
    }
  }, [editor]);

  // Backlinks for this note: use the precomputed backlinks field, then
  // resolve to Note objects.
  const backlinks = useMemo(() => {
    return note.backlinks
      .map((id) => allNotes.find((n) => n.id === id))
      .filter((n): n is Note => Boolean(n));
  }, [allNotes, note.backlinks]);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Mode switcher + formatting toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--bd)', background: 'var(--bg1)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', padding: '0 4px' }}>
          <ModeTab icon={Pencil} label="edit" active={viewMode === 'edit'} onClick={() => changeViewMode('edit')} />
          <ModeTab icon={Eye} label="preview" active={viewMode === 'preview'} onClick={() => changeViewMode('preview')} />
          <ModeTab icon={GitCompare} label="diff" active={viewMode === 'diff'} onClick={() => changeViewMode('diff')} />
        </div>
        {viewMode === 'edit' && (
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <FormattingToolbar
              textareaRef={textareaRef}
              body={editor.body}
              onBodyChange={editor.updateBody}
            />
          </div>
        )}
        {viewMode !== 'edit' && <div style={{ flex: 1 }} />}

        {/* Reading-font picker + undo/redo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px', flexShrink: 0, position: 'relative' }}>
          <button
            onClick={() => setFontMenuOpen((o) => !o)}
            title="Reading font"
            aria-label="Reading font"
            style={{
              width: 28, height: 28, borderRadius: 3,
              background: fontMenuOpen ? 'var(--bg3)' : 'transparent',
              border: '1px solid transparent',
              color: editorFont === 'mono' ? 'var(--t2)' : 'var(--acc2)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; }}
            onMouseLeave={(e) => { if (!fontMenuOpen) e.currentTarget.style.background = 'transparent'; }}
          >
            <Type size={14} strokeWidth={2} />
          </button>
          {fontMenuOpen && (
            <>
              <div
                onClick={() => setFontMenuOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              />
              <div
                style={{
                  position: 'absolute', top: 34, right: 0, zIndex: 50,
                  width: 220, background: 'var(--bg2)', border: '1px solid var(--bd2)',
                  borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', padding: 4,
                }}
              >
                <div style={{
                  fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'var(--t3)', fontWeight: 600, padding: '5px 8px 6px',
                }}>
                  reading font
                </div>
                {EDITOR_FONT_OPTIONS.map((opt) => {
                  const active = editorFont === opt.id;
                  // <samp> escapes the global monospace-!important rule, so the
                  // inline font stack actually renders — each label previews
                  // its own face.
                  const stack =
                    opt.id === 'serif'
                      ? "'Iowan Old Style','Palatino Linotype',Palatino,Charter,Georgia,serif"
                      : opt.id === 'sans'
                        ? "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"
                        : "'JetBrains Mono','Fira Mono',monospace";
                  return (
                    <button
                      key={opt.id}
                      onClick={() => { setEditorFont(opt.id); setFontMenuOpen(false); }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 4,
                        background: active ? 'var(--acc-bg)' : 'transparent',
                        border: active ? '1px solid #3d378a' : '1px solid transparent',
                        color: 'var(--t1)', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', gap: 8,
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg3)'; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ width: 14, flexShrink: 0, color: 'var(--acc2)' }}>
                        {active && <Check size={13} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <samp style={{ fontFamily: stack, fontSize: 14, color: active ? 'var(--t1)' : 'var(--t2)', display: 'block' }}>
                          {opt.label} — Aa
                        </samp>
                        <span style={{ fontSize: 10, color: 'var(--t3)' }}>{opt.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <button
            onClick={editor.undo}
            disabled={!editor.canUndo}
            title="Undo (⌘Z)"
            style={{
              width: 28, height: 28, borderRadius: 3,
              background: 'transparent', border: '1px solid transparent',
              color: editor.canUndo ? 'var(--t2)' : 'var(--t3)',
              cursor: editor.canUndo ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: editor.canUndo ? 1 : 0.4,
            }}
            onMouseEnter={(e) => { if (editor.canUndo) { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--t1)'; } }}
            onMouseLeave={(e) => { if (editor.canUndo) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)'; } }}
          >
            <Undo2 size={14} strokeWidth={2} />
          </button>
          <button
            onClick={editor.redo}
            disabled={!editor.canRedo}
            title="Redo (⌘⇧Z)"
            style={{
              width: 28, height: 28, borderRadius: 3,
              background: 'transparent', border: '1px solid transparent',
              color: editor.canRedo ? 'var(--t2)' : 'var(--t3)',
              cursor: editor.canRedo ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: editor.canRedo ? 1 : 0.4,
            }}
            onMouseEnter={(e) => { if (editor.canRedo) { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--t1)'; } }}
            onMouseLeave={(e) => { if (editor.canRedo) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)'; } }}
          >
            <Redo2 size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div
        className="sb-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px 48px 80px',
        }}
      >
        {/* Comfortable writing measure — don't let lines run edge-to-edge
            on wide screens */}
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {/* Note header: tags + metadata */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
            flexWrap: 'wrap',
          }}
        >
          {note.tags.map((t) => {
            const c = TAG_COLORS[t] || TAG_COLORS.strategy;
            return (
              <span
                key={t}
                style={{
                  fontSize: 11,
                  color: c.color,
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                  padding: '3px 8px',
                  borderRadius: 3,
                  fontFamily: 'inherit',
                }}
              >
                #{t}
              </span>
            );
          })}
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>·</span>
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>{formatDate(note.updatedAt)}</span>
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>·</span>
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>{countWords(note.body)} words</span>
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>·</span>
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>{backlinks.length} backlinks</span>
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>·</span>
          <button
            onClick={() => onToggleEvergreen(note.id)}
            title="Toggle evergreen status"
            style={{
              fontSize: 11,
              color: note.status === 'evergreen' ? 'var(--grn)' : 'var(--t3)',
              background: note.status === 'evergreen' ? 'var(--grn-bg)' : 'transparent',
              border:
                note.status === 'evergreen' ? '1px solid #1a4a2a' : '1px solid var(--bd2)',
              padding: '3px 8px',
              borderRadius: 3,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'inherit',
            }}
          >
            {note.status === 'evergreen' ? (
              <>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--grn)' }} />
                evergreen
              </>
            ) : (
              <>
                <RefreshCw size={11} />
                draft
              </>
            )}
          </button>
          {onDeleteNote && (
            <button
              onClick={() => onDeleteNote(note.id)}
              title="Delete note"
              style={{
                fontSize: 11,
                color: 'var(--t3)',
                background: 'transparent',
                border: '1px solid transparent',
                padding: '3px 6px',
                borderRadius: 3,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: 'inherit',
                marginLeft: 'auto',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--red)';
                e.currentTarget.style.borderColor = 'var(--bd2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--t3)';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>

        {/* Title */}
        <input
          className="sb-prose-input"
          value={editor.title}
          onChange={(e) => editor.updateTitle(e.target.value)}
          placeholder="Untitled note"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--t1)',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            padding: 0,
            marginBottom: 6,
            fontFamily: 'inherit',
            caretColor: 'var(--acc2)',
          }}
        />

        {/* Subtitle */}
        <input
          className="sb-prose-input"
          value={editor.subtitle}
          onChange={(e) => editor.updateSubtitle(e.target.value)}
          placeholder="A short tagline…"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--t3)',
            fontSize: 15,
            fontStyle: 'italic',
            padding: 0,
            marginBottom: 28,
            fontFamily: 'inherit',
            caretColor: 'var(--acc2)',
          }}
        />

        {/* Body: conditional on view mode */}
        {viewMode === 'edit' && (
          <div
            className="sb-editor-wrap"
            onClick={handleWrapClick}
            style={{ position: 'relative', minHeight: 200 }}
          >
            <pre
              ref={preRef}
              className="sb-editor-pre"
              dangerouslySetInnerHTML={{ __html: overlayHtml }}
              aria-hidden="true"
            />
            <textarea
              ref={textareaRef}
              className="sb-editor-textarea"
              value={editor.body}
              onChange={handleBodyChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onBlur={() => setTimeout(closeLinkAuto, 150)}
              placeholder="# Start writing your note…"
              spellCheck={false}
              rows={1}
            />
          </div>
        )}

        {/* Wiki-link autocomplete dropdown */}
        {viewMode === 'edit' && linkAuto && linkMatches.length > 0 && linkPos && (
          <div
            style={{
              position: 'fixed', left: linkPos.x, top: linkPos.y, zIndex: 300,
              width: 280, background: 'var(--bg2)', border: '1px solid var(--bd2)',
              borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              overflow: 'hidden', padding: 4,
            }}
          >
            <div style={{
              fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--t3)', fontWeight: 600, padding: '4px 8px 6px',
            }}>
              link to note {linkAuto.query ? `— “${linkAuto.query}”` : ''}
            </div>
            {linkMatches.map((n, i) => (
              <div
                key={n.id}
                onMouseEnter={() => setLinkSel(i)}
                onMouseDown={(e) => { e.preventDefault(); selectWikiLink(n.title); }}
                style={{
                  padding: '6px 8px', borderRadius: 4, cursor: 'pointer',
                  background: i === linkSel ? 'var(--acc-bg)' : 'transparent',
                  border: i === linkSel ? '1px solid #3d378a' : '1px solid transparent',
                }}
              >
                <div style={{ fontSize: 12, color: i === linkSel ? 'var(--t1)' : 'var(--t2)', fontWeight: 500 }}>
                  [[{n.title}]]
                </div>
                {n.subtitle && (
                  <div style={{
                    fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {n.subtitle}
                  </div>
                )}
              </div>
            ))}
            <div style={{ fontSize: 9, color: 'var(--t3)', padding: '5px 8px 3px', opacity: 0.7 }}>
              ↑↓ navigate · ↵ link · esc dismiss
            </div>
          </div>
        )}

        {viewMode === 'preview' && (
          <div style={{ minHeight: 200 }}>
            {previewSegments.map((seg, i) =>
              seg.type === 'mermaid' ? (
                <Mermaid key={i} chart={seg.content} />
              ) : (
                <div
                  key={i}
                  className="sb-preview-prose"
                  dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(seg.content) }}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    const wikiEl = target.closest('[data-wiki]') as HTMLElement | null;
                    if (wikiEl) {
                      e.preventDefault();
                      onOpenNoteByTitle(wikiEl.getAttribute('data-wiki') || '');
                    }
                  }}
                  style={{ cursor: 'default' }}
                />
              ),
            )}
          </div>
        )}

        {viewMode === 'diff' && (
          <DiffView diffLines={diffLines} additions={stats.additions} deletions={stats.deletions} dirty={dirty} />
        )}

        {/* Backlinks section */}
        <div
          style={{
            marginTop: 40,
            background: 'var(--bg2)',
            border: '1px solid var(--bd)',
            borderRadius: 4,
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              color: 'var(--t3)',
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            backlinks — {backlinks.length} {backlinks.length === 1 ? 'note' : 'notes'} reference this
          </div>
          {backlinks.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--t3)', fontStyle: 'italic' }}>
              no backlinks yet. link this note from elsewhere with [[{note.title}]].
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {backlinks.map((b) => (
                <button
                  key={b.id}
                  onClick={() => onOpenNote(b.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    color: 'var(--t2)',
                    fontSize: 13,
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--acc2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--t2)';
                  }}
                >
                  <ArrowLeft size={13} style={{ opacity: 0.6 }} />
                  {b.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hint at bottom for wiki-link click */}
        <div
          style={{
            marginTop: 16,
            fontSize: 11,
            color: 'var(--t3)',
            opacity: 0.7,
            fontStyle: 'italic',
          }}
        >
          tip: ⌘+click a [[wiki-link]] to open that note in a new tab
        </div>
        </div>
      </div>

      {/* Writer AI — manages its own open/close state */}
      <WriterAI
        textareaRef={textareaRef}
        body={editor.body}
        onBodyChange={editor.updateBody}
        noteTitle={editor.title}
        noteTags={note.tags}
      />

      {/* Slash command menu */}
      <SlashMenu
        open={slashOpen}
        position={slashPos}
        commands={slashCommands}
        onSelect={handleSlashSelect}
        onClose={() => setSlashOpen(false)}
      />
    </div>
  );
}

/* ---------- Mode Tab Button ---------- */
function ModeTab({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 36,
        padding: '0 14px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--acc)' : '2px solid transparent',
        color: active ? 'var(--t1)' : 'var(--t3)',
        fontSize: 12,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: active ? 600 : 400,
        transition: 'color 0.12s',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--t2)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--t3)'; }}
    >
      <Icon size={13} strokeWidth={2} />
      {label}
    </button>
  );
}

/* ---------- Diff View (GitHub-style) ---------- */
function DiffView({
  diffLines,
  additions,
  deletions,
  dirty,
}: {
  diffLines: import('@/utils/diff').DiffLine[];
  additions: number;
  deletions: number;
  dirty: boolean;
}) {
  const noChanges = additions === 0 && deletions === 0;

  return (
    <div style={{ minHeight: 200 }}>
      {/* Diff stats header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 14px',
          background: 'var(--bg1)',
          border: '1px solid var(--bd)',
          borderRadius: '5px 5px 0 0',
          borderBottom: 'none',
          fontSize: 11,
          color: 'var(--t3)',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          changes
        </span>
        {additions > 0 && (
          <span style={{ color: 'var(--grn)', fontWeight: 600 }}>+{additions}</span>
        )}
        {deletions > 0 && (
          <span style={{ color: 'var(--red)', fontWeight: 600 }}>-{deletions}</span>
        )}
        {noChanges && (
          <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>
            {dirty ? 'no changes yet…' : 'no unsaved changes — body is in sync with saved version'}
          </span>
        )}
      </div>

      {/* Diff body */}
      <div
        style={{
          background: 'var(--bg1)',
          border: '1px solid var(--bd)',
          borderRadius: noChanges ? 5 : '0 0 5px 5px',
          overflow: 'hidden',
        }}
      >
        {diffLines.map((line, idx) => {
          const isAdd = line.type === 'add';
          const isRem = line.type === 'remove';
          const bgColor = isAdd
            ? 'rgba(52, 211, 153, 0.08)'
            : isRem
              ? 'rgba(248, 113, 113, 0.08)'
              : 'transparent';
          const textColor = isAdd
            ? 'var(--grn)'
            : isRem
              ? 'var(--red)'
              : 'var(--t2)';
          const prefix = isAdd ? '+' : isRem ? '-' : ' ';
          const lineLabelStyle: React.CSSProperties = {
            color: 'var(--t3)',
            fontSize: 10,
            minWidth: 32,
            textAlign: 'right',
            paddingRight: 8,
            userSelect: 'none',
            opacity: 0.6,
          };

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                fontFamily: 'inherit',
                fontSize: 13,
                lineHeight: '1.6',
                background: bgColor,
                borderBottom: idx < diffLines.length - 1 ? '1px solid var(--bd)' : 'none',
              }}
            >
              <span style={lineLabelStyle}>{line.oldNum ?? ''}</span>
              <span style={lineLabelStyle}>{line.newNum ?? ''}</span>
              <span
                style={{
                  color: textColor,
                  paddingRight: 8,
                  userSelect: 'none',
                  fontWeight: 700,
                  minWidth: 16,
                  textAlign: 'center',
                }}
              >
                {prefix}
              </span>
              <span
                style={{
                  color: textColor,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  paddingRight: 12,
                  flex: 1,
                }}
              >
                {line.text || ' '}
              </span>
            </div>
          );
        })}
      </div>

      {noChanges && (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: 'var(--t3)',
            fontStyle: 'italic',
          }}
        >
          tip: switch to <strong style={{ color: 'var(--t2)' }}>edit</strong> mode, make changes,
          then come back here to see what changed vs. the saved version.
        </div>
      )}
    </div>
  );
}
