'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Note, LibraryItem, Highlight } from '@/types';
import { renderMarkdownHtml } from '@/utils/markdownHtml';
import {
  Search, Plus, BookOpen, FileText, Rss, Link as LinkIcon, X,
  Highlighter, StickyNote, Sparkles, ArrowRight, Type, List,
  Upload, ArrowUpRight, RefreshCw, Loader2, Globe,
  ChevronLeft, ChevronRight, Minus, Menu,
} from 'lucide-react';

interface ReadingViewProps {
  libraryItems: LibraryItem[];
  highlights: Highlight[];
  notes: Note[];
  onBack: () => void;
  onOpenNote: (id: string) => void;
  onAddLibraryItem: (item: Omit<LibraryItem, 'id' | 'addedAt' | 'highlights'>) => LibraryItem;
  onUpdateLibraryItem: (id: string, patch: Partial<LibraryItem>) => void;
  onDeleteLibraryItem: (id: string) => void;
  onAddHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>) => Highlight;
  onUpdateHighlight: (id: string, patch: Partial<Highlight>) => void;
  onDeleteHighlight: (id: string) => void;
  onCreateNoteFromHighlight: (highlight: Highlight, sourceTitle: string) => void;
}

type TabFilter = 'all' | 'books' | 'papers' | 'news';
type SidebarTab = 'ai' | 'highlights' | 'notes';
type HighlightColor = 'yellow' | 'purple' | 'green';
type FontSize = 'sm' | 'md' | 'lg';

const FONT_SIZES: Record<FontSize, number> = { sm: 12, md: 14, lg: 17 };

interface Chapter {
  idx: number;
  title: string;
  content: string;
}

const TYPE_ABBREV: Record<string, { label: string; color: string; bg: string }> = {
  epub: { label: 'EP', color: '#b0a8fb', bg: '#1e1a3a' },
  pdf: { label: 'PDF', color: '#60a5fa', bg: '#1e3a5a' },
  rss: { label: 'RSS', color: '#fb923c', bg: '#3d2a10' },
  url: { label: 'URL', color: '#34d399', bg: '#0a1f16' },
};

const HIGHLIGHT_BORDER: Record<HighlightColor, string> = {
  yellow: '#fbbf24',
  purple: '#7c6ef7',
  green: '#34d399',
};

const HIGHLIGHT_BG: Record<HighlightColor, string> = {
  yellow: '#3d3200',
  purple: '#1e1a3a',
  green: '#0a1f16',
};

const NEWS_CATEGORIES = [
  { id: 'tech', label: 'tech' },
  { id: 'science', label: 'science' },
  { id: 'business', label: 'business' },
  { id: 'world', label: 'world' },
];

const PAPER_CATEGORIES = [
  { id: 'ai', label: 'AI' },
  { id: 'ml', label: 'Machine Learning' },
  { id: 'cl', label: 'NLP' },
  { id: 'cv', label: 'Computer Vision' },
  { id: 'physics', label: 'Physics' },
  { id: 'bio', label: 'Biology' },
  { id: 'math', label: 'Math' },
  { id: 'econ', label: 'Economics' },
];

interface FetchedItem {
  id: string;
  title: string;
  author: string;
  type: string;
  source: string;
  url: string;
  score: number;
  content: string;
  time: number;
}

export function ReadingView({
  libraryItems, highlights, notes, onBack, onOpenNote,
  onAddLibraryItem, onUpdateLibraryItem, onDeleteLibraryItem,
  onAddHighlight, onUpdateHighlight, onDeleteHighlight,
  onCreateNoteFromHighlight,
}: ReadingViewProps) {
  const [search, setSearch] = useState('');
  const [tabFilter, setTabFilter] = useState<TabFilter>('all');
  const [activeItemId, setActiveItemId] = useState<string | null>(libraryItems[0]?.id || null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('ai');
  const [currentHighlightColor, setCurrentHighlightColor] = useState<HighlightColor>('yellow');
  const [showImport, setShowImport] = useState(false);
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);
  const [selectionPos, setSelectionPos] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState('');
  const readerRef = useRef<HTMLDivElement>(null);

  // Ebook reader state
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [fontSize, setFontSize] = useState<FontSize>('md');
  const [showToc, setShowToc] = useState(false);
  const tocBtnRef = useRef<HTMLButtonElement>(null);
  const tocPopoverRef = useRef<HTMLDivElement>(null);

  // Live news/papers state
  const [showFeedPanel, setShowFeedPanel] = useState<'news' | 'papers' | null>(null);
  const [newsCategory, setNewsCategory] = useState('tech');
  const [paperCategory, setPaperCategory] = useState('ai');
  const [fetchedItems, setFetchedItems] = useState<FetchedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const activeItem = useMemo(
    () => libraryItems.find((l) => l.id === activeItemId) || null,
    [libraryItems, activeItemId],
  );

  const itemHighlights = useMemo(
    () => highlights.filter((h) => h.libraryItemId === activeItemId),
    [highlights, activeItemId],
  );

  // Split the item's content into chapters by lines that are exactly `---`.
  // Each chapter is a { idx, title, content } where the title is extracted
  // from the first `# …` heading in the segment, or falls back to
  // "Chapter N" / "Page N" for epubs / pdfs respectively.
  const chapters = useMemo<Chapter[]>(() => {
    if (!activeItem?.content) return [];
    const raw = activeItem.content;
    // Split on lines that consist of only --- (with optional surrounding whitespace).
    const parts = raw.split(/\r?\n---\s*\r?\n/);
    const isPdf = activeItem.type === 'pdf';
    const result: Chapter[] = [];
    parts.forEach((part, i) => {
      const trimmed = part.replace(/^\s+/, '').replace(/\s+$/, '');
      if (trimmed.length === 0) return;
      const titleMatch = trimmed.match(/^#\s+(.+?)\s*$/m);
      let title: string;
      if (titleMatch) {
        title = titleMatch[1].replace(/^#+\s*/, '').trim();
      } else {
        title = isPdf ? `Page ${i + 1}` : `Chapter ${i + 1}`;
      }
      result.push({ idx: result.length, title, content: trimmed });
    });
    if (result.length === 0 && raw.trim().length > 0) {
      // Fallback: treat the whole content as a single chapter.
      const titleMatch = raw.match(/^#\s+(.+?)\s*$/m);
      const title = titleMatch ? titleMatch[1].trim() : (isPdf ? 'Page 1' : 'Chapter 1');
      result.push({ idx: 0, title, content: raw.trim() });
    }
    return result;
  }, [activeItem]);

  const currentChapter: Chapter | null = chapters[currentChapterIdx] || chapters[0] || null;

  // When the active item changes, jump to the chapter whose title matches
  // the stored chapterTitle (Kindle-style "return to where you left off"),
  // falling back to chapter 0.
  useEffect(() => {
    if (!activeItem || chapters.length === 0) {
      setCurrentChapterIdx(0);
      return;
    }
    const stored = activeItem.chapterTitle;
    if (stored) {
      const matchIdx = chapters.findIndex(
        (c) => c.title === stored || c.title.startsWith(stored) || stored.startsWith(c.title),
      );
      setCurrentChapterIdx(matchIdx >= 0 ? matchIdx : 0);
    } else {
      setCurrentChapterIdx(0);
    }
    // Scroll to top of reader on chapter/item change.
    if (readerRef.current) readerRef.current.scrollTop = 0;
  }, [activeItemId, activeItem, chapters]);

  // Persist reading progress whenever the chapter changes.
  // Progress = (currentChapter + 1) / totalChapters * 100, clamped to [0, 100].
  // Also updates chapterTitle so reopening returns to the same chapter.
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeItemId || chapters.length === 0 || !currentChapter) return;
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      const pct = Math.min(100, Math.round(((currentChapterIdx + 1) / chapters.length) * 100));
      onUpdateLibraryItem(activeItemId, {
        progressPercent: pct,
        chapterTitle: currentChapter.title,
        currentPage: currentChapterIdx + 1,
        totalPages: chapters.length,
        lastOpenedAt: new Date().toISOString(),
        status: pct >= 100 ? 'done' : 'reading',
      });
    }, 400);
    return () => {
      if (progressTimer.current) clearTimeout(progressTimer.current);
    };
  }, [activeItemId, currentChapterIdx, chapters, currentChapter, onUpdateLibraryItem]);

  const goToChapter = useCallback((idx: number) => {
    setCurrentChapterIdx(idx);
    setShowToc(false);
    if (readerRef.current) readerRef.current.scrollTop = 0;
  }, []);

  const goToPrevChapter = useCallback(() => {
    setCurrentChapterIdx((i) => Math.max(0, i - 1));
    if (readerRef.current) readerRef.current.scrollTop = 0;
  }, []);

  const goToNextChapter = useCallback(() => {
    setCurrentChapterIdx((i) => Math.min(chapters.length - 1, i + 1));
    if (readerRef.current) readerRef.current.scrollTop = 0;
  }, [chapters.length]);

  const decreaseFontSize = useCallback(() => {
    setFontSize((s) => (s === 'lg' ? 'md' : s === 'md' ? 'sm' : 'sm'));
  }, []);
  const increaseFontSize = useCallback(() => {
    setFontSize((s) => (s === 'sm' ? 'md' : s === 'md' ? 'lg' : 'lg'));
  }, []);

  // Close TOC popover on outside click.
  useEffect(() => {
    if (!showToc) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        tocPopoverRef.current && !tocPopoverRef.current.contains(target) &&
        tocBtnRef.current && !tocBtnRef.current.contains(target)
      ) {
        setShowToc(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showToc]);

  const filteredItems = useMemo(() => {
    let items = libraryItems;
    if (tabFilter === 'books') items = items.filter((l) => l.type === 'epub');
    else if (tabFilter === 'papers') items = items.filter((l) => l.type === 'pdf');
    else if (tabFilter === 'news') items = items.filter((l) => l.type === 'rss' || l.type === 'url');
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((l) => l.title.toLowerCase().includes(q) || (l.author?.toLowerCase().includes(q) ?? false));
    }
    return items;
  }, [libraryItems, tabFilter, search]);

  const sections = useMemo(() => {
    const reading = filteredItems.filter((l) => l.status === 'reading');
    const papers = filteredItems.filter((l) => l.type === 'pdf' && l.status !== 'reading');
    const news = filteredItems.filter((l) => (l.type === 'rss' || l.type === 'url') && l.status !== 'reading');
    const books = filteredItems.filter((l) => l.type === 'epub' && l.status !== 'reading' && l.status !== 'done');
    const done = filteredItems.filter((l) => l.status === 'done');
    return { reading, papers, news, books, done };
  }, [filteredItems]);

  // Render the CURRENT chapter's content with highlights applied.
  // The reader only ever displays one chapter at a time, so highlight
  // matching stays scoped to the visible text — highlights defined on
  // other chapters are simply hidden until the user navigates to them.
  const readerHtml = useMemo(() => {
    if (!currentChapter?.content) return '';
    let html = renderMarkdownHtml(currentChapter.content);
    // Apply highlights by wrapping matching text
    for (const hl of itemHighlights) {
      const escapedText = hl.text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
      const re = new RegExp(escapedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      html = html.replace(re, `<mark class="hl-${hl.color}" data-hl-id="${hl.id}">${escapedText}</mark>`);
    }
    return html;
  }, [currentChapter, itemHighlights]);

  // Handle text selection in reader
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.toString().trim().length < 3) {
        setShowSelectionToolbar(false);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const readerEl = readerRef.current;
      if (!readerEl) return;
      const readerRect = readerEl.getBoundingClientRect();
      if (rect.top < readerRect.top || rect.bottom > readerRect.bottom) {
        setShowSelectionToolbar(false);
        return;
      }
      setSelectedText(sel.toString().trim());
      setSelectionPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
      setShowSelectionToolbar(true);
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Create a real highlight
  const handleHighlight = useCallback(() => {
    if (!selectedText || !activeItemId) return;
    onAddHighlight({
      libraryItemId: activeItemId,
      text: selectedText,
      color: currentHighlightColor,
      location: 'selection',
    });
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
    setShowSelectionToolbar(false);
    setSidebarTab('highlights');
  }, [selectedText, activeItemId, currentHighlightColor, onAddHighlight]);

  // Fetch news from API
  const fetchNews = useCallback(async (cat: string) => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const res = await fetch(`/api/reading/news?category=${cat}&XTransformPort=3000`);
      if (!res.ok) throw new Error('Failed to fetch news');
      const data = await res.json();
      setFetchedItems(data.items || []);
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : 'Failed to fetch');
      setFetchedItems([]);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  // Fetch papers from API
  const fetchPapers = useCallback(async (cat: string) => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const res = await fetch(`/api/reading/papers?category=${cat}&XTransformPort=3000`);
      if (!res.ok) throw new Error('Failed to fetch papers');
      const data = await res.json();
      setFetchedItems(data.items || []);
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : 'Failed to fetch');
      setFetchedItems([]);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  // Open feed panel
  const openFeed = useCallback((type: 'news' | 'papers') => {
    setShowFeedPanel(type);
    if (type === 'news') fetchNews(newsCategory);
    else fetchPapers(paperCategory);
  }, [newsCategory, paperCategory, fetchNews, fetchPapers]);

  // Add fetched item to library
  const addFetchedItem = useCallback((item: FetchedItem) => {
    const newItem = onAddLibraryItem({
      title: item.title,
      author: item.author,
      type: item.type as 'pdf' | 'url' | 'rss',
      source: item.source,
      progressPercent: 0,
      status: 'unread',
      content: item.content ? `# ${item.title}\n\n${item.content}` : `# ${item.title}\n\n*Content from ${item.source}. Visit the original source for full text.*\n\nSource: ${item.url}`,
      chapterTitle: item.source,
    });
    return newItem;
  }, [onAddLibraryItem]);

  // Handle file upload — sends file to API for real text extraction
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const isEpub = file.name.endsWith('.epub');
    const isPdf = file.name.endsWith('.pdf');
    if (!isEpub && !isPdf) return;

    setUploadingFile(true);
    try {
      // Send file to server for real text extraction
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/reading/extract?XTransformPort=3000', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Failed to extract content');
      }

      const data = await res.json();

      const newItem = onAddLibraryItem({
        title: data.title || file.name.replace(/\.(epub|pdf)$/, ''),
        author: data.author || 'Unknown',
        type: isEpub ? 'epub' : 'pdf',
        source: 'Uploaded file',
        progressPercent: 0,
        status: 'unread',
        content: data.content,
        totalPages: data.totalPages || 1,
        currentPage: 1,
        chapterTitle: isEpub ? 'Chapter 1' : 'Page 1',
      });

      // Auto-select the newly added item
      setActiveItemId(newItem.id);
      setShowImport(false);
    } catch (err) {
      // Fallback: create item with error message
      const title = file.name.replace(/\.(epub|pdf)$/, '');
      onAddLibraryItem({
        title,
        author: 'Unknown',
        type: isEpub ? 'epub' : 'pdf',
        source: 'Uploaded file',
        progressPercent: 0,
        status: 'unread',
        content: `# ${title}\n\n*Failed to extract content from this file. The file may be corrupted or use a format that cannot be parsed.*\n\nFile: ${file.name}\nSize: ${(file.size / 1024 / 1024).toFixed(1)} MB`,
        totalPages: 1,
        currentPage: 1,
      });
      setShowImport(false);
    } finally {
      setUploadingFile(false);
      // Reset file input so the same file can be uploaded again
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [onAddLibraryItem]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Topbar */}
      <div style={{
        height: 44, background: 'var(--bg1)', borderBottom: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t3)' }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0 }}>dashboard</button>
          <span>/</span>
          <span style={{ color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <BookOpen size={13} color="var(--acc2)" /> reading
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => openFeed('news')} style={{
            height: 28, padding: '0 12px',
            background: 'var(--bg2)', color: 'var(--t2)', border: '1px solid var(--bd2)', borderRadius: 4,
            fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Globe size={12} /> tech news
          </button>
          <button onClick={() => openFeed('papers')} style={{
            height: 28, padding: '0 12px',
            background: 'var(--bg2)', color: 'var(--t2)', border: '1px solid var(--bd2)', borderRadius: 4,
            fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <FileText size={12} /> papers
          </button>
          <button onClick={() => setShowImport(true)} style={{
            height: 28, padding: '0 12px',
            background: 'var(--acc)', color: '#fff', border: 'none', borderRadius: 4,
            fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Plus size={12} /> add source
          </button>
        </div>
      </div>

      {/* 3-column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Library panel (220px) */}
        <div style={{
          width: 220, minWidth: 220, background: 'var(--bg1)', borderRight: '1px solid var(--bd)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 4, padding: '0 10px', height: 30,
            }}>
              <Search size={13} color="var(--t3)" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search library…"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--t1)', fontSize: 11, fontFamily: 'inherit', caretColor: 'var(--acc2)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', padding: '0 10px 6px', gap: 2, flexShrink: 0 }}>
            {([
              { id: 'all', label: 'all' }, { id: 'books', label: 'books' },
              { id: 'papers', label: 'papers' }, { id: 'news', label: 'news' },
            ] as const).map((t) => (
              <button key={t.id} onClick={() => setTabFilter(t.id)} style={{
                flex: 1, padding: '3px 4px', background: 'transparent',
                border: 'none', borderBottom: tabFilter === t.id ? '2px solid var(--acc)' : '2px solid transparent',
                color: tabFilter === t.id ? 'var(--acc2)' : 'var(--t3)',
                fontSize: 9, fontFamily: 'inherit', cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
              }}>{t.label}</button>
            ))}
          </div>
          <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {sections.reading.length > 0 && <LibrarySection label="currently reading" items={sections.reading} activeItemId={activeItemId} onSelect={setActiveItemId} />}
            {sections.books.length > 0 && <LibrarySection label="books" items={sections.books} activeItemId={activeItemId} onSelect={setActiveItemId} />}
            {sections.papers.length > 0 && <LibrarySection label="research papers" items={sections.papers} activeItemId={activeItemId} onSelect={setActiveItemId} />}
            {sections.news.length > 0 && <LibrarySection label="news & articles" items={sections.news} activeItemId={activeItemId} onSelect={setActiveItemId} />}
            {sections.done.length > 0 && <LibrarySection label="read" items={sections.done} activeItemId={activeItemId} onSelect={setActiveItemId} />}
            {filteredItems.length === 0 && (
              <div style={{ padding: '20px 12px', fontSize: 10, color: 'var(--t3)', textAlign: 'center', fontStyle: 'italic' }}>
                no items — try fetching news or papers
              </div>
            )}
          </div>
        </div>

        {/* Reader (flex: 1) or Feed Panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {showFeedPanel ? (
            <FeedPanel
              type={showFeedPanel}
              items={fetchedItems}
              loading={feedLoading}
              error={feedError}
              newsCategory={newsCategory}
              setNewsCategory={(c) => { setNewsCategory(c); fetchNews(c); }}
              paperCategory={paperCategory}
              setPaperCategory={(c) => { setPaperCategory(c); fetchPapers(c); }}
              onAdd={addFetchedItem}
              onRead={(item) => {
                const newItem = addFetchedItem(item);
                setActiveItemId(newItem.id);
                setShowFeedPanel(null);
              }}
              onClose={() => setShowFeedPanel(null)}
              onRefresh={() => showFeedPanel === 'news' ? fetchNews(newsCategory) : fetchPapers(paperCategory)}
            />
          ) : activeItem ? (
            <>
              {/* Reader topbar — chapter nav + font size + highlights */}
              <div style={{
                height: 38, background: 'var(--bg1)', borderBottom: '1px solid var(--bd)',
                display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, flexShrink: 0,
                position: 'relative',
              }}>
                {/* Prev chapter */}
                <button
                  onClick={goToPrevChapter}
                  disabled={currentChapterIdx <= 0}
                  title="Previous chapter"
                  style={{
                    width: 26, height: 26, borderRadius: 4,
                    background: 'transparent', border: 'none',
                    color: currentChapterIdx <= 0 ? 'var(--t3)' : 'var(--t2)',
                    cursor: currentChapterIdx <= 0 ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: currentChapterIdx <= 0 ? 0.35 : 1,
                  }}
                >
                  <ChevronLeft size={15} />
                </button>

                {/* Chapter title + TOC dropdown trigger */}
                <button
                  ref={tocBtnRef}
                  onClick={() => setShowToc((v) => !v)}
                  disabled={chapters.length === 0}
                  title="Table of contents"
                  style={{
                    flex: 1, minWidth: 0, height: 26, borderRadius: 4,
                    background: showToc ? 'var(--acc-bg)' : 'transparent',
                    border: '1px solid ' + (showToc ? 'var(--acc)' : 'transparent'),
                    color: showToc ? 'var(--acc2)' : 'var(--t2)',
                    cursor: 'pointer', padding: '0 8px',
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 11, fontFamily: 'inherit', fontWeight: 500,
                  }}
                  onMouseEnter={(e) => { if (!showToc) { e.currentTarget.style.background = 'var(--bg2)'; } }}
                  onMouseLeave={(e) => { if (!showToc) { e.currentTarget.style.background = 'transparent'; } }}
                >
                  <Menu size={12} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                    {currentChapter?.title || activeItem.title}
                  </span>
                  {chapters.length > 1 && (
                    <span style={{ fontSize: 9, color: 'var(--t3)', flexShrink: 0, fontWeight: 600 }}>
                      {currentChapterIdx + 1}/{chapters.length}
                    </span>
                  )}
                </button>

                {/* Next chapter */}
                <button
                  onClick={goToNextChapter}
                  disabled={currentChapterIdx >= chapters.length - 1}
                  title="Next chapter"
                  style={{
                    width: 26, height: 26, borderRadius: 4,
                    background: 'transparent', border: 'none',
                    color: currentChapterIdx >= chapters.length - 1 ? 'var(--t3)' : 'var(--t2)',
                    cursor: currentChapterIdx >= chapters.length - 1 ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: currentChapterIdx >= chapters.length - 1 ? 0.35 : 1,
                  }}
                >
                  <ChevronRight size={15} />
                </button>

                <div style={{ width: 1, height: 18, background: 'var(--bd)' }} />

                {/* Font size controls A- / A+ */}
                <button
                  onClick={decreaseFontSize}
                  disabled={fontSize === 'sm'}
                  title="Decrease font size"
                  style={{
                    width: 26, height: 26, borderRadius: 4,
                    background: 'transparent', border: 'none',
                    color: fontSize === 'sm' ? 'var(--t3)' : 'var(--t2)',
                    cursor: fontSize === 'sm' ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: fontSize === 'sm' ? 0.35 : 1,
                    fontSize: 10, fontWeight: 700,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: 13 }}>A</span>
                    <Minus size={9} />
                  </span>
                </button>
                <button
                  onClick={increaseFontSize}
                  disabled={fontSize === 'lg'}
                  title="Increase font size"
                  style={{
                    width: 26, height: 26, borderRadius: 4,
                    background: 'transparent', border: 'none',
                    color: fontSize === 'lg' ? 'var(--t3)' : 'var(--t2)',
                    cursor: fontSize === 'lg' ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: fontSize === 'lg' ? 0.35 : 1,
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 700 }}>A</span>
                </button>

                <div style={{ width: 1, height: 18, background: 'var(--bd)' }} />

                {/* Reading progress bar (chapter-based) */}
                {chapters.length > 1 && (
                  <div style={{
                    width: 80, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden',
                    flexShrink: 0,
                  }} title={`${Math.round(((currentChapterIdx + 1) / chapters.length) * 100)}%`}>
                    <div style={{
                      height: '100%',
                      width: `${((currentChapterIdx + 1) / chapters.length) * 100}%`,
                      background: 'var(--acc)', borderRadius: 2,
                      transition: 'width 0.2s ease',
                    }} />
                  </div>
                )}

                <div style={{ width: 1, height: 18, background: 'var(--bd)' }} />

                <ToolButton icon={Highlighter} label="yellow" active={currentHighlightColor === 'yellow'} onClick={() => setCurrentHighlightColor('yellow')} color="#fbbf24" />
                <ToolButton icon={Highlighter} label="purple" active={currentHighlightColor === 'purple'} onClick={() => setCurrentHighlightColor('purple')} color="#7c6ef7" />
                <ToolButton icon={Highlighter} label="green" active={currentHighlightColor === 'green'} onClick={() => setCurrentHighlightColor('green')} color="#34d399" />
              </div>

              {/* TOC dropdown */}
              {showToc && chapters.length > 0 && (
                <div
                  ref={tocPopoverRef}
                  className="sb-fade-in"
                  style={{
                    position: 'absolute',
                    top: 42, left: 48, width: 320, maxWidth: 'calc(100% - 96px)',
                    background: 'var(--bg2)',
                    border: '1px solid var(--bd2)',
                    borderRadius: 6,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                    zIndex: 250,
                    maxHeight: 360,
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    padding: '8px 12px', borderBottom: '1px solid var(--bd)',
                    fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: 'var(--t3)', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span>table of contents · {chapters.length} {activeItem.type === 'pdf' ? 'pages' : 'chapters'}</span>
                    <button onClick={() => setShowToc(false)} style={{
                      background: 'transparent', border: 'none', color: 'var(--t3)',
                      cursor: 'pointer', padding: 0, display: 'flex',
                    }}><X size={11} /></button>
                  </div>
                  <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
                    {chapters.map((c) => {
                      const active = c.idx === currentChapterIdx;
                      return (
                        <button
                          key={c.idx}
                          onClick={() => goToChapter(c.idx)}
                          style={{
                            width: '100%', textAlign: 'left',
                            padding: '7px 10px', borderRadius: 3,
                            background: active ? 'var(--acc-bg)' : 'transparent',
                            border: 'none',
                            borderLeft: active ? '2px solid var(--acc)' : '2px solid transparent',
                            color: active ? 'var(--acc2)' : 'var(--t2)',
                            fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8,
                            transition: 'background 0.1s, color 0.1s',
                          }}
                          onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--t1)'; } }}
                          onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)'; } }}
                        >
                          <span style={{
                            fontSize: 9, color: 'var(--t3)', width: 24, flexShrink: 0,
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {String(c.idx + 1).padStart(2, '0')}
                          </span>
                          <span style={{
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                            fontWeight: active ? 600 : 400,
                          }}>
                            {c.title}
                          </span>
                          {active && <span style={{ fontSize: 9, color: 'var(--acc)', flexShrink: 0 }}>reading</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reader body */}
              <div
                ref={readerRef}
                className="sb-scroll"
                style={{ flex: 1, overflowY: 'auto', padding: '32px 56px', display: 'flex', justifyContent: 'center' }}
              >
                <div
                  className="sb-reader-prose"
                  style={{
                    maxWidth: 720, width: '100%',
                    // Drive the proportional font-size scaling via the CSS variable
                    // consumed by .sb-reader-prose and its h1/h2/h3 rules in globals.css.
                    ['--reader-fs' as string]: `${FONT_SIZES[fontSize]}px`,
                  }}
                  dangerouslySetInnerHTML={{ __html: readerHtml }}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    const hl = target.closest('[data-hl-id]') as HTMLElement | null;
                    if (hl) setSidebarTab('highlights');
                  }}
                />
              </div>

              {/* Floating selection toolbar */}
              {showSelectionToolbar && (
                <div style={{
                  position: 'fixed', left: selectionPos.x, top: selectionPos.y,
                  transform: 'translate(-50%, -100%)', zIndex: 200,
                  background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 6,
                  padding: '4px 6px', display: 'flex', gap: 4,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}>
                  <SelectionBtn icon={Highlighter} label="highlight" onClick={handleHighlight} color={currentHighlightColor === 'yellow' ? '#fbbf24' : currentHighlightColor === 'purple' ? '#7c6ef7' : '#34d399'} />
                  <SelectionBtn icon={Sparkles} label="ask AI" onClick={() => {
                    navigator.clipboard?.writeText(selectedText);
                    setShowSelectionToolbar(false);
                  }} />
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--t3)', fontSize: 14, fontStyle: 'italic' }}>
              <BookOpen size={32} color="var(--t3)" strokeWidth={1.5} />
              <span>select an item from your library</span>
              <span style={{ fontSize: 11 }}>or fetch tech news / research papers from the topbar</span>
            </div>
          )}
        </div>

        {/* AI Sidebar (250px) */}
        <div style={{
          width: 250, minWidth: 250, background: 'var(--bg1)', borderLeft: '1px solid var(--bd)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', height: 38, borderBottom: '1px solid var(--bd)', flexShrink: 0 }}>
            {([
              { id: 'ai', label: 'AI' }, { id: 'highlights', label: 'Highlights' }, { id: 'notes', label: 'Notes' },
            ] as const).map((t) => (
              <button key={t.id} onClick={() => setSidebarTab(t.id)} style={{
                flex: 1, background: 'transparent', border: 'none',
                borderBottom: sidebarTab === t.id ? '2px solid var(--acc)' : '2px solid transparent',
                color: sidebarTab === t.id ? 'var(--t1)' : 'var(--t3)',
                fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: sidebarTab === t.id ? 600 : 400,
              }}>{t.label}</button>
            ))}
          </div>
          <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {sidebarTab === 'ai' && activeItem && <AISidebar item={activeItem} highlights={itemHighlights} />}
            {sidebarTab === 'highlights' && (
              <HighlightsTab highlights={itemHighlights} onOpenNote={onOpenNote} onDelete={onDeleteHighlight} onCreateNote={(hl) => onCreateNoteFromHighlight(hl, activeItem?.title || '')} />
            )}
            {sidebarTab === 'notes' && <NotesTab highlights={itemHighlights.filter((h) => h.note)} onOpenNote={onOpenNote} />}
          </div>
        </div>
      </div>

      {/* Import modal */}
      {showImport && (
        <ImportModal
          onClose={() => !uploadingFile && setShowImport(false)}
          fileInputRef={fileInputRef}
          onFileUpload={handleFileUpload}
          uploading={uploadingFile}
          onAddRss={(url) => {
            onAddLibraryItem({
              title: url,
              type: 'rss', source: url, progressPercent: 0, status: 'unread',
              content: `# ${url}\n\n*RSS feed content will appear here once fetched.*\n\nFeed URL: ${url}`,
            });
            setShowImport(false);
          }}
          onAddUrl={(url) => {
            onAddLibraryItem({
              title: url.replace(/^https?:\/\//, '').split('/')[0],
              type: 'url', source: url, progressPercent: 0, status: 'unread',
              content: `# ${url}\n\n*Article content extracted from ${url}.*\n\nThis is a clipped article. The full content would be extracted using Mozilla Readability.`,
            });
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}

/* ---------- Feed Panel (news/papers) ---------- */

function FeedPanel({
  type, items, loading, error, newsCategory, setNewsCategory, paperCategory, setPaperCategory,
  onAdd, onRead, onClose, onRefresh,
}: {
  type: 'news' | 'papers';
  items: FetchedItem[];
  loading: boolean;
  error: string | null;
  newsCategory: string;
  setNewsCategory: (c: string) => void;
  paperCategory: string;
  setPaperCategory: (c: string) => void;
  onAdd: (item: FetchedItem) => void;
  onRead: (item: FetchedItem) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const cats = type === 'news' ? NEWS_CATEGORIES : PAPER_CATEGORIES;
  const currentCat = type === 'news' ? newsCategory : paperCategory;
  const setCat = type === 'news' ? setNewsCategory : setPaperCategory;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Feed header */}
      <div style={{
        height: 38, background: 'var(--bg1)', borderBottom: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0,
      }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--t1)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
          {type === 'news' ? <Globe size={13} color="var(--acc2)" /> : <FileText size={13} color="var(--acc2)" />}
          {type === 'news' ? 'live tech news' : 'trending research papers'}
        </span>
        <button onClick={onRefresh} title="Refresh" style={{
          width: 26, height: 26, borderRadius: 4, background: 'transparent', border: 'none',
          color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {loading ? <Loader2 size={13} className="sb-spin" /> : <RefreshCw size={13} />}
        </button>
        <button onClick={onClose} style={{
          width: 26, height: 26, borderRadius: 4, background: 'transparent', border: 'none',
          color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><X size={14} /></button>
      </div>

      {/* Categories */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--bd)', flexShrink: 0, flexWrap: 'wrap' }}>
        {cats.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} style={{
            padding: '3px 8px', borderRadius: 3,
            background: currentCat === c.id ? 'var(--acc-bg)' : 'transparent',
            border: '1px solid ' + (currentCat === c.id ? 'var(--acc-bd)' : 'var(--bd2)'),
            color: currentCat === c.id ? 'var(--acc2)' : 'var(--t3)',
            fontSize: 9, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>{c.label}</button>
        ))}
      </div>

      {/* Items */}
      <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {loading && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
            <Loader2 size={20} className="sb-spin" style={{ margin: '0 auto 8px' }} />
            fetching {type}…
          </div>
        )}
        {error && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--red)', fontSize: 11 }}>
            failed to fetch: {error}
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--t3)', fontSize: 11, fontStyle: 'italic' }}>
            no items found
          </div>
        )}
        {!loading && !error && items.map((item) => (
          <div key={item.id} style={{
            background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 5,
            padding: '10px 12px', marginBottom: 8,
          }}>
            <div style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 500, lineHeight: 1.4, marginBottom: 4 }}>
              {item.title}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 8 }}>
              {item.author} · {item.source}{item.score > 0 ? ` · ${item.score} points` : ''}
            </div>
            {item.content && (
              <div style={{ fontSize: 10, color: 'var(--t2)', lineHeight: 1.5, marginBottom: 8, maxHeight: 60, overflow: 'hidden' }}>
                {item.content.slice(0, 200)}{item.content.length > 200 ? '…' : ''}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => onRead(item)} style={{
                background: 'var(--acc)', color: '#fff', border: 'none', borderRadius: 3,
                padding: '4px 10px', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
              }}>read now</button>
              <button onClick={() => onAdd(item)} style={{
                background: 'var(--bg3)', color: 'var(--t2)', border: '1px solid var(--bd2)', borderRadius: 3,
                padding: '4px 10px', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer',
              }}>add to library</button>
              <a href={item.url} target="_blank" rel="noopener" style={{
                background: 'transparent', color: 'var(--t3)', border: '1px solid var(--bd2)', borderRadius: 3,
                padding: '4px 10px', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>source <ArrowUpRight size={9} /></a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Library / Reader / Sidebar sub-components ---------- */

function LibrarySection({ label, items, activeItemId, onSelect }: {
  label: string; items: LibraryItem[]; activeItemId: string | null; onSelect: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ padding: '6px 12px 4px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t3)', fontWeight: 600 }}>{label}</div>
      {items.map((item) => {
        const isActive = item.id === activeItemId;
        const typeInfo = TYPE_ABBREV[item.type];
        return (
          <div key={item.id} onClick={() => onSelect(item.id)} style={{
            height: 52, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8,
            background: isActive ? 'var(--acc-bg)' : 'transparent',
            borderLeft: isActive ? '2px solid var(--acc)' : '2px solid transparent',
            cursor: 'pointer', opacity: item.status === 'done' ? 0.5 : 1,
          }} onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg2)'; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
            <div style={{ width: 28, height: 36, borderRadius: 2, background: typeInfo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: typeInfo.color, flexShrink: 0 }}>{typeInfo.label}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: isActive ? 'var(--acc2)' : 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
              <div style={{ fontSize: 9, color: 'var(--t3)' }}>{item.author ? `${item.author} · ` : ''}{item.type}</div>
              {(item.type === 'epub' || item.type === 'pdf') && item.progressPercent > 0 && item.status !== 'done' && (
                <div style={{ height: 2, background: 'var(--bg3)', borderRadius: 1, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${item.progressPercent}%`, background: 'var(--acc)', borderRadius: 1 }} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ToolButton({ icon: Icon, label, active, onClick, color }: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  label: string; active?: boolean; onClick: () => void; color?: string;
}) {
  return (
    <button onClick={onClick} title={label} style={{
      width: 26, height: 26, borderRadius: 4, background: active ? 'var(--acc-bg)' : 'transparent',
      border: 'none', color: color || 'var(--t3)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}><Icon size={13} color={color} /></button>
  );
}

function SelectionBtn({ icon: Icon, label, onClick, color }: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  label: string; onClick: () => void; color?: string;
}) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--bg3)', border: 'none', borderRadius: 3, padding: '4px 8px',
      color: color || 'var(--t2)', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600,
    }}><Icon size={11} color={color} />{label}</button>
  );
}

function AISidebar({ item, highlights }: { item: LibraryItem; highlights: Highlight[] }) {
  const cards = [
    { type: 'connection', desc: `This chapter's concepts map to your existing notes on <em>PARA Method</em> and <em>Zettelkasten</em> — same ideas, different framing.`, action: 'explore connections ↗' },
    { type: 'capture ready', desc: highlights.length > 0 ? `${highlights.length} highlighted passages ready to become atomic notes. Capture them now?` : 'No highlights yet. Select text in the reader to start capturing.', action: highlights.length > 0 ? 'capture all ↗' : '' },
    { type: 'summarise', desc: 'Run progressive summarisation — bold key ideas, then extract golden lines.', action: 'summarise ↗' },
    { type: 'reflection', desc: `You've read ${item.progressPercent}% of this. What surprised you most?`, action: 'reflect ↗' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="sb-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--acc)', boxShadow: '0 0 6px rgba(124,110,247,0.6)' }} />
        <span style={{ fontSize: 10, color: 'var(--acc2)' }}>reading intelligence</span>
      </div>
      {cards.map((card, i) => (
        <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 4, padding: '9px 11px', cursor: 'pointer', transition: 'background 0.12s, border 0.12s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--acc-bg)'; e.currentTarget.style.borderColor = 'var(--acc)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.borderColor = 'var(--bd)'; }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', marginBottom: 4, fontWeight: 600 }}>{card.type}</div>
          <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.5, marginBottom: 5 }} dangerouslySetInnerHTML={{ __html: card.desc }} />
          {card.action && <div style={{ fontSize: 10, color: 'var(--acc)', display: 'flex', alignItems: 'center', gap: 3 }}>{card.action}<ArrowUpRight size={9} /></div>}
        </div>
      ))}
    </div>
  );
}

function HighlightsTab({ highlights, onOpenNote, onDelete, onCreateNote }: {
  highlights: Highlight[]; onOpenNote: (id: string) => void; onDelete: (id: string) => void; onCreateNote: (hl: Highlight) => void;
}) {
  if (highlights.length === 0) return <div style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>no highlights yet — select text in the reader</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {highlights.map((hl) => (
        <div key={hl.id} style={{ borderLeft: `3px solid ${HIGHLIGHT_BORDER[hl.color]}`, paddingLeft: 10, padding: '8px 10px', background: HIGHLIGHT_BG[hl.color], borderRadius: '0 4px 4px 0', marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--t1)', lineHeight: 1.5, marginBottom: 4 }}>{hl.text}</div>
          <div style={{ fontSize: 9, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{hl.color}</span>
            {hl.note && <span>· has note</span>}
            {hl.linkedNoteId && <span>· linked</span>}
            <div style={{ flex: 1 }} />
            {!hl.linkedNoteId && (
              <button onClick={() => onCreateNote(hl)} style={{ background: 'transparent', border: 'none', color: 'var(--acc)', fontSize: 9, fontFamily: 'inherit', cursor: 'pointer' }}>capture →</button>
            )}
            <button onClick={() => onDelete(hl.id)} style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 0, opacity: 0.5 }}><X size={10} /></button>
          </div>
          {hl.note && <div style={{ fontSize: 10, color: 'var(--acc2)', marginTop: 4, fontStyle: 'italic' }}>{hl.note}</div>}
        </div>
      ))}
    </div>
  );
}

function NotesTab({ highlights, onOpenNote }: { highlights: Highlight[]; onOpenNote: (id: string) => void }) {
  if (highlights.length === 0) return <div style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>no notes yet</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {highlights.map((hl) => (
        <div key={hl.id} style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 4, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 4, fontStyle: 'italic' }}>"{hl.text.slice(0, 80)}{hl.text.length > 80 ? '…' : ''}"</div>
          <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.5 }}>{hl.note}</div>
          {hl.linkedNoteId && <button onClick={() => onOpenNote(hl.linkedNoteId!)} style={{ marginTop: 6, background: 'transparent', border: 'none', color: 'var(--acc)', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer' }}>open in editor →</button>}
        </div>
      ))}
    </div>
  );
}

function ImportModal({ onClose, fileInputRef, onFileUpload, uploading, onAddRss, onAddUrl }: {
  onClose: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  onAddRss: (url: string) => void;
  onAddUrl: (url: string) => void;
}) {
  const [rssUrl, setRssUrl] = useState('');
  const [articleUrl, setArticleUrl] = useState('');
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '90vw', background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 600 }}>add to your library</span>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 3, background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer' }}><X size={14} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', fontWeight: 600, marginBottom: 8, display: 'block' }}>upload epub/pdf</label>
            <input ref={fileInputRef} type="file" accept=".epub,.pdf" onChange={onFileUpload} style={{ display: 'none' }} disabled={uploading} />
            <div onClick={() => !uploading && fileInputRef.current?.click()} style={{ border: '2px dashed var(--bd2)', borderRadius: 6, padding: '20px', textAlign: 'center', color: 'var(--t3)', fontSize: 11, fontStyle: 'italic', cursor: uploading ? 'wait' : 'pointer' }}>
              {uploading ? (
                <>
                  <Loader2 size={20} className="sb-spin" style={{ margin: '0 auto 8px' }} color="var(--acc2)" />
                  extracting text from your file…
                </>
              ) : (
                <>
                  <Upload size={20} style={{ margin: '0 auto 8px' }} color="var(--t3)" />
                  click to browse epub/pdf files
                </>
              )}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', fontWeight: 600, marginBottom: 8, display: 'block' }}>add RSS feed</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={rssUrl} onChange={(e) => setRssUrl(e.target.value)} placeholder="https://example.com/feed.xml" style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 4, padding: '8px 10px', color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit', outline: 'none', caretColor: 'var(--acc2)' }} />
              <button onClick={() => rssUrl.trim() && onAddRss(rssUrl.trim())} style={{ background: 'var(--acc)', color: '#fff', border: 'none', borderRadius: 4, padding: '0 14px', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600 }}>add</button>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', fontWeight: 600, marginBottom: 8, display: 'block' }}>clip article URL</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={articleUrl} onChange={(e) => setArticleUrl(e.target.value)} placeholder="https://example.com/article" style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 4, padding: '8px 10px', color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit', outline: 'none', caretColor: 'var(--acc2)' }} />
              <button onClick={() => articleUrl.trim() && onAddUrl(articleUrl.trim())} style={{ background: 'var(--acc)', color: '#fff', border: 'none', borderRadius: 4, padding: '0 14px', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600 }}>clip</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
