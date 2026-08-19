'use client';

import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { Note, LibraryItem, Highlight } from '@/types';
import { renderMarkdownHtml } from '@/utils/markdownHtml';
import {
  Search, Plus, BookOpen, FileText, Rss, Link as LinkIcon, X,
  Highlighter, StickyNote, Sparkles, ArrowRight, Type, List,
  Upload, ArrowUpRight, RefreshCw, Loader2, Globe,
  ChevronLeft, ChevronRight, Minus, Menu, Library, AlignJustify, Newspaper,
} from 'lucide-react';
import { plural } from '@/utils/markdown';
import { repairImportedText } from '@/utils/repairImportedText';
import { ViewHeader, HeaderButton, HeaderDivider } from './ViewHeader';
import { ReaderMargin } from './ReaderMargin';
import { Bookshelf } from './Bookshelf';
import { DailyPaper, type Edition, type PaperStory } from './DailyPaper';
import { EDITION_MARKER } from '@/utils/serverHtml';

interface ReadingViewProps {
  libraryItems: LibraryItem[];
  highlights: Highlight[];
  notes: Note[];
  onBack: () => void;
  onOpenNote: (id: string) => void;
  onAddLibraryItem: (item: Omit<LibraryItem, 'id' | 'addedAt' | 'updatedAt' | 'highlights'>) => LibraryItem;
  onUpdateLibraryItem: (id: string, patch: Partial<LibraryItem>) => void;
  onDeleteLibraryItem: (id: string) => void;
  onAddHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>) => Highlight;
  onUpdateHighlight: (id: string, patch: Partial<Highlight>) => void;
  onDeleteHighlight: (id: string) => void;
  onCreateNoteFromHighlight: (highlight: Highlight, sourceTitle: string) => void;
}

type TabFilter = 'all' | 'books' | 'papers' | 'news';
type ReadMode = 'scroll' | 'pages';

/** Space between the two leaves of a spread, in px. */
const BOOK_GAP = 72;
const READ_MODE_KEY = 'sb-read-mode';
type HighlightColor = 'yellow' | 'purple' | 'green';
type FontSize = 'sm' | 'md' | 'lg';

// Reading sizes, not UI sizes. The old scale topped out at 17px and started at
// 12 — chrome sizes, applied to book-length text.
const FONT_SIZES: Record<FontSize, number> = { sm: 16, md: 18, lg: 21 };
const FONT_SIZE_LABELS: Record<FontSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };

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

/* Theme tokens rather than fixed hexes, so highlights stay readable in light
   mode instead of staying light-on-dark wherever they are shown. */
const HIGHLIGHT_BORDER: Record<HighlightColor, string> = {
  yellow: 'var(--amb)',
  purple: 'var(--acc)',
  green: 'var(--grn)',
};

const HIGHLIGHT_BG: Record<HighlightColor, string> = {
  yellow: 'var(--amb-bg)',
  purple: 'var(--acc-bg)',
  green: 'var(--grn-bg)',
};

/** The three marks, offered at the point of highlighting. */
const HIGHLIGHT_SWATCHES: { id: HighlightColor; label: string; swatch: string }[] = [
  { id: 'yellow', label: 'yellow', swatch: 'var(--amb)' },
  { id: 'purple', label: 'purple', swatch: 'var(--acc)' },
  { id: 'green', label: 'green', swatch: 'var(--grn)' },
];

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
  // Reading defaults to one column. Both rails used to be pinned open, which
  // left a 915px column wrapped around a 680px measure — the widest screen in
  // the app showing the narrowest text. They open on demand instead.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);
  const [selectionPos, setSelectionPos] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState('');
  const readerRef = useRef<HTMLDivElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);

  // Ebook reader state
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [fontSize, setFontSize] = useState<FontSize>('md');
  const [showToc, setShowToc] = useState(false);
  /* Contents, marks and search are one surface with three tabs — three ways of
     asking "where else is there" rather than three separate affordances. */
  const [apparatusOpen, setApparatusOpen] = useState(false);
  const [apparatusTab, setApparatusTab] = useState<'contents' | 'marks' | 'search'>('contents');
  const [bookQuery, setBookQuery] = useState('');
  /* The chrome goes while you read and comes back on movement. */
  const [chromeIdle, setChromeIdle] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const tocBtnRef = useRef<HTMLButtonElement>(null);
  const tocPopoverRef = useRef<HTMLDivElement>(null);

  // Scrolling or paged. Paged is the book: text laid into columns, a spread at
  // a time. Kept per device — it is a reading habit, not a property of a book.
  const [readMode, setReadMode] = useState<ReadMode>('scroll');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [spreadStep, setSpreadStep] = useState(0);
  const [columnCount, setColumnCount] = useState(2);

  // How far through the chapter the reader is, from the scroll position — the
  // old bar only counted chapters, so it never moved while you read one.
  const [scrollProgress, setScrollProgress] = useState(0);
  // Width of the reading column, so the marginalia re-measure when the layout
  // reflows (a rail opening, or the window resizing).
  const [readerWidth, setReaderWidth] = useState(0);

  // Live news/papers state
  const [showFeedPanel, setShowFeedPanel] = useState<'news' | 'papers' | null>(null);
  const [newsCategory, setNewsCategory] = useState('tech');
  const [paperCategory, setPaperCategory] = useState('ai');
  const [fetchedItems, setFetchedItems] = useState<FetchedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  // Which feed item is being fetched, so the row can say it is working.
  const [openingArticle, setOpeningArticle] = useState<string | null>(null);
  // Building today's edition takes a few seconds of fetching, so the button
  // says what it is doing rather than appearing to have missed the click.
  const [buildingEdition, setBuildingEdition] = useState(false);

  const activeItem = useMemo(
    () => libraryItems.find((l) => l.id === activeItemId) || null,
    [libraryItems, activeItemId],
  );

  /**
   * An edition stores its structure, not just its prose. When the active item
   * is one, the paper is set from that structure rather than run through the
   * book reader — a broadsheet is not a chapter.
   */
  const edition = useMemo<Edition | null>(() => {
    const raw = activeItem?.content;
    if (!raw || !raw.startsWith(EDITION_MARKER)) return null;
    try {
      const json = raw.slice(EDITION_MARKER.length).split('<!--braindot:edition-text-->')[0];
      return JSON.parse(json.trim()) as Edition;
    } catch {
      // Fall through to reading it as text rather than showing nothing.
      return null;
    }
  }, [activeItem?.content]);

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
    // Books imported before the extractor was fixed still carry the damage in
    // their stored text, and the original file is not kept to re-extract from.
    // This puts them back together on read; nothing is written back.
    //
    // Only uploaded files, because only the file importer ever produced that
    // damage. Articles and editions are composed by current code, and running
    // the repair over them misread a link line — which ends in ")" rather than
    // a full stop — as an unfinished sentence, and stripped the heading that
    // followed it. Every story headline in the paper disappeared.
    const isImportedFile = activeItem.type === 'epub' || activeItem.type === 'pdf';
    const raw = isImportedFile ? repairImportedText(activeItem.content) : activeItem.content;
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
    // Keyed on the text, not on the item object. Saving your reading position
    // replaces that object, and a `chapters` array that changed identity every
    // time progress was written fed straight back into the effect that writes
    // progress — an endless save loop that also yanked the page back to the
    // top a few times a second.
  }, [activeItem?.id, activeItem?.content, activeItem?.type]);

  const currentChapter: Chapter | null = chapters[currentChapterIdx] || chapters[0] || null;

  // Reopen where you left off. The chapter is recovered from the saved
  // percentage rather than from a stored title: `progress` is the field the
  // vault actually has and actually syncs, so this survives a device change.
  // The old code wrote chapterTitle/currentPage/totalPages/lastOpenedAt, none
  // of which exist on LibraryItem — so nothing was ever restored, and the
  // percentage it wrote as `progressPercent` never reached the cloud either.
  // Restore once per item. Guarding on the id matters: this effect resets the
  // scroll position, and it used to re-run on every change to the item —
  // including the progress it had just saved — so the page jumped back to the
  // top while you were reading it.
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!activeItemId || chapters.length === 0) return;
    if (restoredFor.current === activeItemId) return;
    restoredFor.current = activeItemId;
    const saved = activeItem?.progress ?? 0;
    const idx = saved > 0
      ? Math.min(chapters.length - 1, Math.max(0, Math.round((saved / 100) * chapters.length) - 1))
      : 0;
    setCurrentChapterIdx(idx);
    if (readerRef.current) readerRef.current.scrollTop = 0;
  }, [activeItemId, activeItem?.progress, chapters.length]);

  // Persist reading progress whenever the chapter changes.
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedProgress = useRef<{ id: string; pct: number; status: string } | null>(null);
  useEffect(() => {
    if (!activeItemId || chapters.length === 0 || !currentChapter) return;
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      const pct = Math.min(100, Math.round(((currentChapterIdx + 1) / chapters.length) * 100));
      const status = pct >= 100 ? 'done' : 'reading';
      // Write only on a real change. An unconditional write replaced the item
      // object on every pass, which is what turned this into a loop.
      if (savedProgress.current?.id === activeItemId
        && savedProgress.current.pct === pct
        && savedProgress.current.status === status) return;
      savedProgress.current = { id: activeItemId, pct, status };
      onUpdateLibraryItem(activeItemId, { progress: pct, status });
    }, 400);
    return () => {
      if (progressTimer.current) clearTimeout(progressTimer.current);
    };
  }, [activeItemId, currentChapterIdx, chapters, currentChapter, onUpdateLibraryItem]);

  /* A chapter starts at its first line, not wherever the last one left you.
     This lives in an effect rather than in goToChapter so the reset also
     covers arriving at a chapter by turning past the end of the previous one. */
  useEffect(() => {
    if (readerRef.current) readerRef.current.scrollTop = 0;
  }, [currentChapterIdx, activeItemId]);

  // Track scroll position for the progress hairline, and the column width so
  // the margin can re-place its marks after a reflow. Both are passive.
  useEffect(() => {
    const el = readerRef.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const max = el.scrollHeight - el.clientHeight;
      setScrollProgress(max > 8 ? Math.min(1, el.scrollTop / max) : 0);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    el.addEventListener('scroll', onScroll, { passive: true });

    const ro = new ResizeObserver(() => {
      setReaderWidth(el.clientWidth);
      measure();
    });
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [activeItemId, currentChapterIdx]);

  // Remember the reading mode across sessions.
  useEffect(() => {
    const saved = localStorage.getItem(READ_MODE_KEY);
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    if (saved === 'pages' || saved === 'scroll') setReadMode(saved);
  }, []);

  const changeReadMode = useCallback((m: ReadMode) => {
    setReadMode(m);
    setPageIndex(0);
    try { localStorage.setItem(READ_MODE_KEY, m); } catch {}
  }, []);

  // Lay the chapter out into pages. The flow element is as wide as the
  // viewport; content that does not fit spills into further columns to the
  // right, so the total width divided by one spread gives the page count.
  useLayoutEffect(() => {
    if (readMode !== 'pages') return;
    const viewport = readerRef.current;
    const flow = proseRef.current;
    if (!viewport || !flow) return;

    const measure = () => {
      // The flow's own width, which is the width one spread occupies. Reading
      // it off the viewport's clientWidth included the padding, so every turn
      // advanced ~88px too far and left a sliver of the next columns showing.
      const w = flow.clientWidth;
      if (w < 40) return;
      // One leaf below ~880px: a spread whose columns are narrower than about
      // 40 characters is worse than a single page, not better.
      const cols = w >= 880 ? 2 : 1;
      setColumnCount(cols);
      const step = w + BOOK_GAP;
      setSpreadStep(step);
      // Total laid-out width. scrollWidth is unaffected by the transform, so
      // it stays correct on any page.
      const total = flow.scrollWidth;
      setPageCount(Math.max(1, Math.ceil((total + BOOK_GAP) / step)));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => ro.disconnect();
    // Keyed on what determines the rendered text, since readerHtml itself is
    // derived further down.
  }, [readMode, currentChapter?.content, itemHighlights.length, fontSize, currentChapterIdx, railOpen, libraryOpen]);

  // The page actually shown. Derived rather than stored, so a chapter that
  // repaginates shorter — larger text, a narrower window — cannot leave the
  // reader parked past the end, and no extra render is needed to correct it.
  const page = Math.min(pageIndex, Math.max(0, pageCount - 1));

  /* ---------- the gathering strip ----------
     One stroke per chapter, its width that chapter's real share of the book.
     Length stands in for pages: the reader has the text, not a pagination,
     and characters are proportional to pages at a fixed measure. */
  const gatherings = useMemo(() => {
    const lengths = chapters.map((c) => Math.max(1, c.content.length));
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    return chapters.map((c, i) => ({
      idx: c.idx,
      weight: lengths[i],
      read: i < currentChapterIdx,
      // 230 words a minute over ~5.5 characters a word.
      minutes: Math.max(1, Math.round(lengths[i] / 5.5 / 230)),
      share: lengths[i] / total,
      fill: '0%',
    }));
  }, [chapters, currentChapterIdx]);

  /** How far through the current chapter you are, as the strip draws it. */
  const chapterFill = useMemo(() => {
    const within = readMode === 'pages'
      ? (pageCount > 1 ? (page + 1) / pageCount : 1)
      : scrollProgress;
    return `${Math.round(Math.min(1, Math.max(0, within)) * 100)}%`;
  }, [readMode, page, pageCount, scrollProgress]);

  const gatheringsDrawn = useMemo(
    () => gatherings.map((g) => (g.idx === currentChapterIdx ? { ...g, fill: chapterFill } : g)),
    [gatherings, currentChapterIdx, chapterFill],
  );

  /** Minutes left in the book, from this point on. */
  const minutesLeft = useMemo(() => {
    let m = 0;
    for (const g of gatherings) {
      if (g.idx < currentChapterIdx) continue;
      if (g.idx === currentChapterIdx) {
        m += g.minutes * (1 - parseInt(chapterFill, 10) / 100);
      } else m += g.minutes;
    }
    return Math.round(m);
  }, [gatherings, currentChapterIdx, chapterFill]);

  const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

  /* Derived, not synced: an open panel or menu suppresses the fade, and
     nothing has to be written back when either of them closes. */
  const chromeHidden = chromeIdle && !apparatusOpen && !showTypeMenu;

  /** Marks made in the chapter you are finishing. Highlights record a page
      rather than a chapter, so this counts the ones whose text is in it. */
  const chapterMarkCount = useMemo(() => {
    if (!currentChapter) return 0;
    const hay = currentChapter.content;
    return itemHighlights.filter((h) => h.text && hay.includes(h.text)).length;
  }, [currentChapter, itemHighlights]);

  /* The chrome fades while you read and returns on any movement. It never
     fades while a panel or a menu is open, or there would be no way back to
     the control you were reaching for. */
  useEffect(() => {
    if (!activeItemId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const wake = () => {
      setChromeIdle((idle) => (idle ? false : idle));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setChromeIdle(true), 2600);
    };
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('keydown', wake);
    window.addEventListener('wheel', wake, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('wheel', wake);
    };
  }, [activeItemId, apparatusOpen, showTypeMenu]);

  /* Escape closes the panel before it does anything else. */
  useEffect(() => {
    if (!apparatusOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) { el.blur(); return; }
      setApparatusOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apparatusOpen]);

  const positionMeta = readMode === 'pages'
    ? `p ${page + 1}/${pageCount} · ${hm(minutesLeft)} left`
    : `${hm(minutesLeft)} left`;

  const positionTitle = currentChapter
    ? `${currentChapter.title} — chapter ${currentChapterIdx + 1} of ${chapters.length}, `
      + `about ${hm(gatherings[currentChapterIdx]?.minutes ?? 0)} long · ${hm(minutesLeft)} left in the book`
      + ' — open contents, marks and search'
    : 'Open contents, marks and search';

  /** Search within the book: which chapters carry the phrase, and where. */
  const bookHits = useMemo(() => {
    const q = bookQuery.trim().toLowerCase();
    if (!q) return [] as { idx: number; chapter: string; before: string; match: string; after: string }[];
    const out: { idx: number; chapter: string; before: string; match: string; after: string }[] = [];
    for (const c of chapters) {
      const hay = c.content.toLowerCase();
      let from = 0;
      while (out.length < 40) {
        const at = hay.indexOf(q, from);
        if (at === -1) break;
        out.push({
          idx: c.idx,
          chapter: c.title,
          before: `…${c.content.slice(Math.max(0, at - 34), at).replace(/\s+/g, ' ')}`,
          match: c.content.slice(at, at + q.length),
          after: `${c.content.slice(at + q.length, at + q.length + 44).replace(/\s+/g, ' ')}…`,
        });
        from = at + q.length;
      }
      if (out.length >= 40) break;
    }
    return out;
  }, [bookQuery, chapters]);

  /** At the end of a chapter, and at the end of the book. */
  const atChapterEnd = readMode === 'pages'
    ? pageCount > 0 && page >= pageCount - 1
    : scrollProgress > 0.985;
  const atBookEnd = atChapterEnd && currentChapterIdx >= chapters.length - 1;

  const turnPage = useCallback((dir: 1 | -1) => {
    setPageIndex((stored) => {
      const i = Math.min(stored, Math.max(0, pageCount - 1));
      const next = i + dir;
      if (next >= 0 && next < pageCount) return next;
      // Past either end, carry on into the next or previous chapter — a book
      // does not stop at a chapter break.
      if (next >= pageCount && currentChapterIdx < chapters.length - 1) {
        setCurrentChapterIdx((c) => c + 1);
        return 0;
      }
      if (next < 0 && currentChapterIdx > 0) {
        setCurrentChapterIdx((c) => c - 1);
        return 0;
      }
      return i;
    });
  }, [pageCount, currentChapterIdx, chapters.length]);

  // Arrow keys and space turn pages, the way they do in every reader.
  useEffect(() => {
    if (readMode !== 'pages' || !activeItem) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); turnPage(1); }
      else if (e.key === 'ArrowLeft' || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); turnPage(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readMode, activeItem, turnPage]);

  const goToChapter = useCallback((idx: number) => {
    setCurrentChapterIdx(idx);
    setPageIndex(0);
    setShowToc(false);
  }, []);

  const goToPrevChapter = useCallback(() => {
    setCurrentChapterIdx((i) => Math.max(0, i - 1));
    setPageIndex(0);
    if (readerRef.current) readerRef.current.scrollTop = 0;
  }, []);

  const goToNextChapter = useCallback(() => {
    setCurrentChapterIdx((i) => Math.min(chapters.length - 1, i + 1));
    setPageIndex(0);
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

  const shelfProgress = useMemo(
    () => libraryItems
      .filter((i) => i.status === 'reading' && i.progress > 0 && i.type !== 'url')
      .slice(0, 3)
      .map((i) => ({
        title: i.title,
        progress: Math.round(i.progress),
        highlights: highlights.filter((h) => h.libraryItemId === i.id).length,
      })),
    [libraryItems, highlights],
  );

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

  // Create a real highlight. The colour comes from the click, not from a mode
  // set earlier in a toolbar — you know what a passage means as you mark it.
  const handleHighlight = useCallback((color: HighlightColor) => {
    if (!selectedText || !activeItemId) return;
    onAddHighlight({
      libraryItemId: activeItemId,
      text: selectedText,
      color,
      noteId: null,
      page: null,
    });
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
    setShowSelectionToolbar(false);
  }, [selectedText, activeItemId, onAddHighlight]);

  // Fetch news from API
  const fetchNews = useCallback(async (cat: string) => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const res = await fetch(`/api/reading/news?category=${cat}`);
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
      const res = await fetch(`/api/reading/papers?category=${cat}`);
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

  /**
   * Read a page properly, rather than filing a link and calling it a read.
   *
   * The feed gives a headline and a URL. This asks the server to fetch the
   * page and pull the article out of it; when that fails — a paywall, or a
   * page assembled by scripts in the browser — the item says so instead of
   * storing a stub that claims the content is "available at the source".
   */
  const importArticle = useCallback(async (item: FetchedItem) => {
    let article: Record<string, unknown> | null = null;
    if (item.url) {
      try {
        const res = await fetch('/api/reading/article', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: item.url }),
        });
        article = await res.json();
      } catch {
        article = null;
      }
    }

    const readable = article && !article.error && typeof article.content === 'string';
    const excerpt = String(article?.excerpt ?? '') || item.content || '';
    const fallback = [
      `# ${item.title}`,
      excerpt ? `*${excerpt}*` : '',
      article?.error
        ? `> Braindot could not read this page. ${String(article.error)}`
        : '> Braindot could not reach this page.',
      item.url ? `[Open the original on ${item.source}](${item.url})` : '',
    ].filter(Boolean).join('\n\n');

    return onAddLibraryItem({
      title: readable ? String(article!.title || item.title) : item.title,
      author: (readable ? String(article!.author ?? '') : '') || item.author || null,
      type: item.type as 'pdf' | 'url' | 'rss',
      source: item.source,
      progress: 0,
      excerpt: excerpt.slice(0, 400),
      // A story's lead image becomes its cover on the shelf, so a news item
      // has a face like everything else there.
      coverUrl: readable ? (article!.leadImage as string | null) ?? null : null,
      status: 'unread',
      content: readable ? String(article!.content) : fallback,
    });
  }, [onAddLibraryItem]);

  /**
   * Assemble today's edition and put it on the shelf.
   *
   * The paper is a library item like any other: it gets a cover, opens in the
   * paged reader, and every headline in it can be highlighted into a note.
   * Nothing about reading it is special-cased.
   */
  const buildEdition = useCallback(async () => {
    setBuildingEdition(true);
    try {
      const res = await fetch('/api/reading/edition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sections: ['world', 'business', 'science', 'tech'] }),
      });
      const data = await res.json();
      if (data.error || !data.content) {
        setFeedError(data.error || 'Today’s edition could not be assembled.');
        return;
      }
      const item = onAddLibraryItem({
        title: data.title,
        author: null,
        type: 'url',
        source: 'Braindot',
        progress: 0,
        excerpt: data.excerpt ?? '',
        coverUrl: data.coverUrl ?? null,
        status: 'unread',
        content: data.content,
      });
      setActiveItemId(item.id);
      setShowFeedPanel(null);
      setLibraryOpen(false);
    } catch {
      setFeedError('Today’s edition could not be assembled.');
    } finally {
      setBuildingEdition(false);
    }
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

      const res = await fetch('/api/reading/extract', {
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
        progress: 0,
        excerpt: '',
        coverUrl: data.coverUrl ?? null,
        status: 'unread',
        content: data.content,
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
        progress: 0,
        excerpt: '',
        coverUrl: null,
        status: 'unread',
        content: `# ${title}\n\n*Failed to extract content from this file. The file may be corrupted or use a format that cannot be parsed.*\n\nFile: ${file.name}\nSize: ${(file.size / 1024 / 1024).toFixed(1)} MB`,
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
      {/* The shared header belongs to the library, not to the book. While one
          is open the reader carries its own single 34px row, and stacking the
          two put a title bar above a chrome bar above the page — the thing the
          reader was supposed to stop doing. Everything on it is either in the
          reader chrome (library, marks) or a library-level action you reach by
          closing the book. */}
      {!activeItem && (
      <ViewHeader
        icon={BookOpen}
        title="Reading"
        facts={`${plural(libraryItems.length, 'item')} in the library`}
      >
        <HeaderButton
          icon={Library}
          label={libraryOpen ? 'hide library' : 'library'}
          onClick={() => setLibraryOpen((o) => !o)}
        />
        {activeItem && (
          <HeaderButton
            icon={Library}
            label="shelf"
            onClick={() => setActiveItemId(null)}
          />
        )}
        {activeItem && (
          <HeaderButton
            icon={Highlighter}
            label={`${itemHighlights.length} highlight${itemHighlights.length === 1 ? '' : 's'}`}
            onClick={() => setRailOpen((o) => !o)}
            accent={railOpen}
          />
        )}
        <HeaderDivider />
        <HeaderButton
          icon={Newspaper}
          label={buildingEdition ? 'assembling…' : "today's paper"}
          onClick={() => { if (!buildingEdition) void buildEdition(); }}
        />
        <HeaderButton icon={Globe} label="news" onClick={() => openFeed('news')} />
        <HeaderButton icon={FileText} label="papers" onClick={() => openFeed('papers')} />
        <HeaderButton icon={Plus} label="add source" accent onClick={() => setShowImport(true)} />
      </ViewHeader>
      )}

      {/* Reader-first layout — rails only when asked for */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Library panel — collapses to nothing; reopened from the header */}
        <div style={{
          width: libraryOpen ? 220 : 0,
          minWidth: libraryOpen ? 220 : 0,
          background: 'var(--bg1)',
          borderRight: libraryOpen ? '1px solid var(--bd)' : 'none',
          display: libraryOpen ? 'flex' : 'none',
          flexDirection: 'column',
          overflow: 'hidden',
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
              onAdd={(item) => { void importArticle(item); }}
              onRead={async (item) => {
                setOpeningArticle(item.id);
                try {
                  const newItem = await importArticle(item);
                  setActiveItemId(newItem.id);
                  setShowFeedPanel(null);
                } finally {
                  setOpeningArticle(null);
                }
              }}
              openingId={openingArticle}
              onClose={() => setShowFeedPanel(null)}
              onRefresh={() => showFeedPanel === 'news' ? fetchNews(newsCategory) : fetchPapers(paperCategory)}
            />
          ) : edition ? (
            <DailyPaper
              edition={edition}
              shelf={shelfProgress}
              onAddSource={() => setShowImport(true)}
              onSaveStory={(story: PaperStory) => {
                // A story becomes a note the same way a highlight does: quoted,
                // credited, and linked back to where it came from.
                onCreateNoteFromHighlight(
                  {
                    id: `story_${story.id}`,
                    libraryItemId: activeItemId ?? '',
                    noteId: null,
                    text: [story.headline, story.standfirst, ...story.paragraphs].filter(Boolean).join('\n\n'),
                    color: 'yellow',
                    page: null,
                    createdAt: new Date().toISOString(),
                  },
                  story.source,
                );
              }}
            />
          ) : activeItem ? (
            <>
              {/* ONE ROW. 34px, and it fades to nothing while you read.
                  What replaced the progress bar is the gathering strip: one
                  stroke per chapter, its width that chapter's real share of
                  the book, the way the gatherings of a bound book show on the
                  spine. Read chapters are inked, the one you are in fills to
                  where you are. It says where you are, how long this chapter
                  runs and how much book is left in one object — and clicking
                  it opens the same information at full size. */}
              <div style={{
                height: 34, background: 'var(--bg1)', borderBottom: '1px solid var(--bd)',
                display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4, flexShrink: 0,
                position: 'relative',
                opacity: chromeHidden ? 0 : 1,
                pointerEvents: chromeHidden ? 'none' : 'auto',
                transition: 'opacity 220ms ease',
              }}>
                <button
                  onClick={() => setActiveItemId(null)}
                  title="Close the book and go back to the library"
                  style={{
                    height: 24, padding: '0 9px 0 7px', borderRadius: 4, background: 'transparent',
                    border: 'none', color: 'var(--t2)', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', gap: 6, flexShrink: 0, fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--t1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)'; }}
                >
                  <Library size={13} strokeWidth={1.9} />
                  <span style={{ fontSize: 10.5 }}>library</span>
                </button>

                <span style={{ width: 1, height: 15, background: 'var(--bd)', margin: '0 2px', flexShrink: 0 }} />

                <ReaderIconButton
                  icon={ChevronLeft}
                  label={readMode === 'pages' ? 'Previous page  ←' : 'Previous chapter'}
                  onClick={readMode === 'pages' ? () => turnPage(-1) : goToPrevChapter}
                  disabled={readMode === 'pages'
                    ? (page === 0 && currentChapterIdx <= 0)
                    : currentChapterIdx <= 0}
                />

                <button
                  ref={tocBtnRef}
                  onClick={() => setApparatusOpen((o) => !o)}
                  disabled={chapters.length === 0}
                  title={positionTitle}
                  style={{
                    flex: 1, minWidth: 0, height: 26, borderRadius: 4,
                    background: apparatusOpen ? 'var(--bg2)' : 'transparent',
                    border: 'none', color: 'var(--t2)',
                    cursor: chapters.length === 0 ? 'default' : 'pointer', padding: '0 8px',
                    display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { if (!apparatusOpen) e.currentTarget.style.background = 'var(--bg2)'; }}
                  onMouseLeave={(e) => { if (!apparatusOpen) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ display: 'flex', alignItems: 'stretch', gap: 1, width: 132, height: 10, flexShrink: 0 }}>
                    {gatheringsDrawn.map((g) => (
                      <span
                        key={g.idx}
                        style={{
                          flex: g.weight, minWidth: 2, borderRadius: 1, overflow: 'hidden', display: 'block',
                          background: g.read ? 'var(--t2)' : 'var(--bg3)',
                        }}
                      >
                        <span style={{ display: 'block', height: '100%', width: g.fill, background: 'var(--acc)' }} />
                      </span>
                    ))}
                  </span>
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 11.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {currentChapter?.title ?? activeItem.title}
                  </span>
                  <span className="sb-fig" style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>
                    {positionMeta}
                  </span>
                </button>

                <ReaderIconButton
                  icon={ChevronRight}
                  label={readMode === 'pages' ? 'Next page  →' : 'Next chapter'}
                  onClick={readMode === 'pages' ? () => turnPage(1) : goToNextChapter}
                  disabled={readMode === 'pages'
                    ? (page >= pageCount - 1 && currentChapterIdx >= chapters.length - 1)
                    : currentChapterIdx >= chapters.length - 1}
                />

                <span style={{ width: 1, height: 15, background: 'var(--bd)', margin: '0 2px', flexShrink: 0 }} />

                {/* Scroll or read it as a book. */}
                <button
                  onClick={() => setReadMode((m) => (m === 'pages' ? 'scroll' : 'pages'))}
                  title={readMode === 'pages' ? 'Switch to scrolling' : 'Read as pages'}
                  style={{
                    height: 24, padding: '0 8px', borderRadius: 4, flexShrink: 0,
                    background: readMode === 'pages' ? 'var(--acc-bg)' : 'transparent',
                    border: 'none', color: readMode === 'pages' ? 'var(--acc2)' : 'var(--t2)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                  }}
                >
                  <BookOpen size={12} strokeWidth={1.9} />
                  <span style={{ fontSize: 10.5 }}>{readMode === 'pages' ? 'Pages' : 'Scroll'}</span>
                </button>

                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    onClick={() => setShowTypeMenu((v) => !v)}
                    title="Text size"
                    aria-label="Text size"
                    style={{
                      height: 24, padding: '0 8px', borderRadius: 4,
                      background: showTypeMenu ? 'var(--bg3)' : 'transparent',
                      border: 'none', color: showTypeMenu ? 'var(--t1)' : 'var(--t2)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => { if (!showTypeMenu) e.currentTarget.style.background = 'var(--bg2)'; }}
                    onMouseLeave={(e) => { if (!showTypeMenu) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Type size={12} />
                    <span style={{ fontSize: 10.5 }}>{FONT_SIZE_LABELS[fontSize]}</span>
                  </button>
                  {showTypeMenu && (
                    <>
                      <div onClick={() => setShowTypeMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                      <div style={{
                        position: 'absolute', top: 28, right: 0, zIndex: 50, width: 150,
                        background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 6,
                        boxShadow: '0 10px 28px rgba(0,0,0,0.36)', padding: 4,
                      }}>
                        {(['sm', 'md', 'lg'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => { setFontSize(s); setShowTypeMenu(false); }}
                            style={{
                              width: '100%', textAlign: 'left', padding: '7px 9px', borderRadius: 4,
                              background: fontSize === s ? 'var(--acc-bg)' : 'transparent',
                              border: fontSize === s ? '1px solid var(--acc-bd)' : '1px solid transparent',
                              color: fontSize === s ? 'var(--t1)' : 'var(--t2)',
                              cursor: 'pointer', fontFamily: 'inherit',
                              fontSize: FONT_SIZES[s] * 0.62,
                            }}
                            onMouseEnter={(e) => { if (fontSize !== s) e.currentTarget.style.background = 'var(--bg3)'; }}
                            onMouseLeave={(e) => { if (fontSize !== s) e.currentTarget.style.background = 'transparent'; }}
                          >
                            {FONT_SIZE_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={() => { setApparatusOpen(true); setApparatusTab('marks'); }}
                  title="Your marks"
                  style={{
                    height: 24, padding: '0 8px', borderRadius: 4, flexShrink: 0,
                    background: apparatusOpen && apparatusTab === 'marks' ? 'var(--acc-bg)' : 'transparent',
                    border: 'none', color: apparatusOpen && apparatusTab === 'marks' ? 'var(--acc2)' : 'var(--t2)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                  }}
                >
                  <Highlighter size={12} strokeWidth={1.9} />
                  <span className="sb-fig" style={{ fontSize: 10.5 }}>{itemHighlights.length}</span>
                </button>
              </div>

              {/* CONTENTS · MARKS · SEARCH, one surface.
                  Three ways of asking the same question — where else is there —
                  so they are three tabs of one panel rather than three
                  affordances. It comes from the left, the end of a book its
                  contents live at, and the strip above is its collapsed form. */}
              {apparatusOpen && chapters.length > 0 && (
                <>
                  <div onClick={() => setApparatusOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 240 }} />
                  <div
                    ref={tocPopoverRef}
                    className="sb-fade-in"
                    style={{
                      position: 'absolute', top: 34, left: 0, bottom: 0, width: 300, zIndex: 250,
                      background: 'var(--bg1)', borderRight: '1px solid var(--bd)',
                      boxShadow: '14px 0 30px -18px rgba(0,0,0,0.5)',
                      display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}
                  >
                    <div style={{
                      height: 30, flexShrink: 0, display: 'flex', alignItems: 'stretch',
                      borderBottom: '1px solid var(--bd)', padding: '0 4px',
                    }}>
                      {([
                        { id: 'contents' as const, label: 'Contents', count: String(chapters.length) },
                        { id: 'marks' as const, label: 'Marks', count: String(itemHighlights.length) },
                        { id: 'search' as const, label: 'Search', count: '' },
                      ]).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setApparatusTab(t.id)}
                          style={{
                            height: 29, padding: '0 10px', background: 'transparent', border: 'none',
                            borderBottom: `2px solid ${apparatusTab === t.id ? 'var(--acc)' : 'transparent'}`,
                            color: apparatusTab === t.id ? 'var(--t1)' : 'var(--t2)',
                            fontFamily: 'inherit', fontSize: 10.5,
                            fontWeight: apparatusTab === t.id ? 600 : 400,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                          }}
                        >
                          {t.label}
                          <span className="sb-fig" style={{ color: 'var(--t3)' }}>{t.count}</span>
                        </button>
                      ))}
                      <div style={{ flex: 1 }} />
                      <button
                        onClick={() => setApparatusOpen(false)}
                        title="Close  Esc"
                        aria-label="Close"
                        style={{
                          width: 24, height: 24, alignSelf: 'center', borderRadius: 4, background: 'transparent',
                          border: 'none', color: 'var(--t3)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        }}
                      >
                        <X size={12} strokeWidth={2} />
                      </button>
                    </div>

                    {apparatusTab === 'contents' && (
                      <div className="sb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 0 14px' }}>
                        {chapters.map((c) => {
                          const active = c.idx === currentChapterIdx;
                          return (
                            <button
                              key={c.idx}
                              onClick={() => { goToChapter(c.idx); setApparatusOpen(false); }}
                              style={{
                                width: '100%', textAlign: 'left', padding: '7px 12px',
                                background: active ? 'var(--acc-bg)' : 'transparent', border: 'none',
                                color: active ? 'var(--acc2)' : 'var(--t2)',
                                fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 9,
                              }}
                              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg2)'; }}
                              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                            >
                              <span style={{
                                width: 14, height: 8, flexShrink: 0, borderRadius: 1, overflow: 'hidden', display: 'block',
                                background: c.idx < currentChapterIdx ? 'var(--t2)' : 'var(--bg3)',
                              }}>
                                <span style={{
                                  display: 'block', height: '100%',
                                  width: c.idx === currentChapterIdx ? chapterFill : '0%',
                                  background: 'var(--acc)',
                                }} />
                              </span>
                              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.title}
                              </span>
                              <span className="sb-fig" style={{ fontSize: 9.5, color: 'var(--t3)', flexShrink: 0 }}>
                                {gatherings[c.idx]?.minutes}m
                              </span>
                              {c.idx < currentChapterIdx && (
                                <span style={{ fontSize: 10, color: 'var(--grn)', flexShrink: 0 }}>✓</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {apparatusTab === 'marks' && (
                      <div className="sb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {itemHighlights.length === 0 ? (
                          <div style={{ fontSize: 10.5, lineHeight: 1.6, color: 'var(--t3)', textWrap: 'pretty' }}>
                            Nothing marked in this one yet. Select any passage and it lands in the
                            margin, beside the line it came from.
                          </div>
                        ) : itemHighlights.map((h) => (
                          <button
                            key={h.id}
                            onClick={() => { setApparatusOpen(false); if (h.noteId) onOpenNote(h.noteId); }}
                            style={{
                              width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                              borderLeft: `2px solid ${HIGHLIGHT_BORDER[(h.color as HighlightColor) || 'yellow']}`,
                              padding: '1px 0 1px 10px', fontFamily: 'inherit', cursor: 'pointer', display: 'block',
                            }}
                          >
                            <span style={{ display: 'block', fontSize: 10.5, lineHeight: 1.55, color: 'var(--t2)' }}>
                              “{h.text}”
                            </span>
                            {h.noteId && (
                              <span style={{ display: 'block', marginTop: 5, fontSize: 10, lineHeight: 1.5, color: 'var(--acc2)' }}>
                                ¶ kept as a note
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {apparatusTab === 'search' && (
                      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 7, height: 30, margin: '6px 8px 2px',
                          padding: '0 8px', borderRadius: 4, background: 'var(--bg2)',
                          border: `1px solid ${bookQuery ? 'var(--acc-bd)' : 'var(--bd)'}`, flexShrink: 0,
                        }}>
                          <Search size={12} color="var(--t3)" strokeWidth={2} />
                          <input
                            autoFocus
                            value={bookQuery}
                            onChange={(e) => setBookQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') setBookQuery(''); }}
                            placeholder="find in this book"
                            aria-label="Search within this book"
                            style={{
                              flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                              color: 'var(--t1)', fontSize: 11.5, fontFamily: 'inherit', caretColor: 'var(--acc2)',
                            }}
                          />
                          <span className="sb-fig" style={{ fontSize: 10, color: 'var(--t3)' }}>
                            {bookQuery ? bookHits.length : ''}
                          </span>
                        </div>
                        <div className="sb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 0 16px' }}>
                          {bookQuery && bookHits.length === 0 ? (
                            <div style={{ padding: '10px 14px', fontSize: 10.5, color: 'var(--t3)' }}>
                              Nothing in this book matches “{bookQuery}”.
                            </div>
                          ) : bookHits.map((h, i) => (
                            <button
                              key={`${h.idx}-${i}`}
                              onClick={() => { goToChapter(h.idx); setApparatusOpen(false); }}
                              style={{
                                width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                                padding: '8px 14px', fontFamily: 'inherit', cursor: 'pointer', display: 'block',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              <span style={{
                                display: 'block', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                                color: 'var(--t3)', marginBottom: 4,
                              }}>
                                {h.chapter}
                              </span>
                              <span style={{ display: 'block', fontSize: 10.5, lineHeight: 1.55, color: 'var(--t3)' }}>
                                {h.before}
                                <span style={{ color: 'var(--t1)', background: 'var(--acc-bg)', padding: '0 2px', borderRadius: 2 }}>
                                  {h.match}
                                </span>
                                {h.after}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* The page. Paged reading lays the chapter into columns and
                  slides a spread at a time; scrolling reading keeps the single
                  measure with marks in the outer margin. */}
              {readMode === 'pages' ? (
                // The spacing lives on this wrapper and the clipping on the
                // viewport inside it. With padding on the clipping element,
                // overflow is cut at the padding box — so the next spread's
                // columns showed through in the margins, and the page step,
                // measured from clientWidth, was padding-too-wide.
                <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: '34px 44px 30px' }}>
                <div
                  ref={readerRef}
                  className="sb-book-viewport"
                  style={{ flex: 1, minWidth: 0 }}
                  onClick={(e) => {
                    // Clicking the outer third of a leaf turns the page, the
                    // way tapping the edge of a book does. A click that lands
                    // on text, or that ends a selection, is left alone.
                    if (window.getSelection()?.toString()) return;
                    if ((e.target as HTMLElement).closest('mark')) return;
                    const box = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - box.left;
                    if (x < box.width * 0.14) turnPage(-1);
                    else if (x > box.width * 0.86) turnPage(1);
                  }}
                >
                  <div
                    ref={proseRef}
                    className="sb-reader-prose sb-book-flow"
                    style={{
                      ['--reader-fs' as string]: `${FONT_SIZES[fontSize]}px`,
                      ['--book-gap' as string]: `${BOOK_GAP}px`,
                      columnCount,
                      transform: `translateX(-${page * spreadStep}px)`,
                    }}
                    dangerouslySetInnerHTML={{ __html: readerHtml }}
                  />
                </div>
                </div>
              ) : (
                <div
                  ref={readerRef}
                  className="sb-scroll"
                  style={{ flex: 1, overflowY: 'auto', padding: '38px 40px 120px' }}
                >
                  <div className="sb-reader-page">
                    <div
                      ref={proseRef}
                      className="sb-reader-prose sb-reader-measure"
                      style={{ ['--reader-fs' as string]: `${FONT_SIZES[fontSize]}px` }}
                      dangerouslySetInnerHTML={{ __html: readerHtml }}
                    />
                    <div className="sb-reader-margin">
                      <ReaderMargin
                        highlights={itemHighlights}
                        proseRef={proseRef}
                        scrollRef={readerRef}
                        revision={`${currentChapterIdx}:${fontSize}:${itemHighlights.length}:${readerWidth}`}
                        onCapture={(hl) => onCreateNoteFromHighlight(hl, activeItem.title)}
                        onDelete={onDeleteHighlight}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* THE END OF A CHAPTER, AND THE END OF THE BOOK.
                  Previously nothing happened at either: the text simply
                  stopped, which reads as a rendering fault rather than an
                  ending. It sits below the surface rather than inside the
                  flow, so the column measurement that drives paged reading is
                  untouched. */}
              {/* Not gated on the chrome fade: reaching the end is the moment
                  you have stopped reading and want the way onward, so hiding
                  it with the chrome hid it exactly when it was wanted. */}
              {atChapterEnd && chapters.length > 0 && (
                <div style={{
                  flexShrink: 0, borderTop: '1px solid var(--bd)', background: 'var(--bg1)',
                  padding: '11px 22px 13px', display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 9.5, letterSpacing: '0.13em', textTransform: 'uppercase',
                      color: atBookEnd ? 'var(--grn)' : 'var(--t3)', fontWeight: 600, marginBottom: 5,
                    }}>
                      {atBookEnd ? 'You finished it' : `End of ${currentChapter?.title ?? 'this chapter'}`}
                    </div>
                    <div className="sb-fig" style={{ fontSize: 10.5, lineHeight: 1.6, color: 'var(--t3)' }}>
                      {atBookEnd
                        ? `${plural(chapters.length, 'chapter')} · ${plural(itemHighlights.length, 'mark')} · ${activeItem.author || 'unattributed'}`
                        : `about ${hm(gatherings[currentChapterIdx]?.minutes ?? 0)} · `
                          + `${plural(chapterMarkCount, 'mark')} · ${hm(minutesLeft)} left in the book`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {itemHighlights.length > 0 && (
                      <button
                        onClick={() => { setApparatusOpen(true); setApparatusTab('marks'); }}
                        style={{
                          height: 28, padding: '0 11px', borderRadius: 5, background: 'transparent',
                          border: '1px solid var(--bd2)', color: 'var(--t2)', fontFamily: 'inherit',
                          fontSize: 10.5, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.borderColor = 'var(--acc-bd)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t2)'; e.currentTarget.style.borderColor = 'var(--bd2)'; }}
                      >
                        {atBookEnd ? 'see all your marks' : 'marks from this chapter'}
                      </button>
                    )}
                    {atBookEnd ? (
                      <button
                        onClick={() => setActiveItemId(null)}
                        style={{
                          height: 28, padding: '0 13px', borderRadius: 5, background: 'var(--acc)',
                          border: 'none', color: 'var(--on-acc)', fontFamily: 'inherit',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--acc2)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--acc)'; }}
                      >
                        back to the library
                      </button>
                    ) : (
                      <button
                        onClick={goToNextChapter}
                        style={{
                          height: 28, padding: '0 13px', borderRadius: 5, background: 'var(--acc-bg)',
                          border: '1px solid var(--acc-bd)', color: 'var(--acc2)', fontFamily: 'inherit',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8, maxWidth: 300,
                        }}
                      >
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {chapters[currentChapterIdx + 1]?.title ?? 'Next'}
                        </span>
                        <ChevronRight size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
                      </button>
                    )}
                  </div>
                </div>
              )}
              {/* Choose the colour as you mark the passage — that is when you
                  know what the mark means. It used to be a mode set in the
                  toolbar beforehand. */}
              {showSelectionToolbar && (
                <div style={{
                  position: 'fixed', left: selectionPos.x, top: selectionPos.y,
                  transform: 'translate(-50%, -100%)', zIndex: 200,
                  background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 7,
                  padding: 5, display: 'flex', alignItems: 'center', gap: 5,
                  boxShadow: '0 10px 26px rgba(0,0,0,0.34)',
                }}>
                  {HIGHLIGHT_SWATCHES.map((s) => (
                    <button
                      key={s.id}
                      onMouseDown={(e) => { e.preventDefault(); handleHighlight(s.id); }}
                      title={`Highlight — ${s.label}`}
                      aria-label={`Highlight in ${s.label}`}
                      style={{
                        width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                        background: s.swatch, border: '1px solid rgba(255,255,255,0.18)',
                      }}
                    />
                  ))}
                  <span style={{ width: 1, height: 16, background: 'var(--bd2)' }} />
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      navigator.clipboard?.writeText(selectedText);
                      setShowSelectionToolbar(false);
                    }}
                    title="Copy this passage"
                    style={{
                      background: 'transparent', border: 'none', color: 'var(--t2)',
                      fontSize: 10.5, fontFamily: 'inherit', cursor: 'pointer', padding: '0 5px',
                    }}
                  >
                    copy
                  </button>
                </div>
              )}
            </>
          ) : (
            <Bookshelf
              items={libraryItems}
              onOpen={(id) => { setActiveItemId(id); setLibraryOpen(false); }}
              onAddSource={() => setShowImport(true)}
              onFetchNews={() => openFeed('news')}
              onFetchPapers={() => openFeed('papers')}
              onBuildEdition={() => { if (!buildingEdition) void buildEdition(); }}
              buildingEdition={buildingEdition}
            />
          )}
        </div>

        {/* The drawer is now only for the marks — and only earns its place on
            a screen too narrow for the margin, or when you want the whole list
            at once. The AI tab that used to live here asserted things about
            the reader's vault that it had not looked at, and the Notes tab
            filtered on a field no highlight has ever carried, so it was
            permanently empty. A thought about a passage becomes a note in the
            vault, which is what "make a note" already does. */}
        <div style={{
          width: railOpen ? 264 : 0, minWidth: railOpen ? 264 : 0,
          background: 'var(--bg1)', borderLeft: railOpen ? '1px solid var(--bd)' : 'none',
          display: railOpen ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', height: 32, padding: '0 12px',
            borderBottom: '1px solid var(--bd)', flexShrink: 0, gap: 8,
          }}>
            <span style={{
              fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
              color: 'var(--t3)', fontWeight: 600, flex: 1,
            }}>
              {itemHighlights.length > 0 ? plural(itemHighlights.length, 'mark') : 'marks'}
            </span>
            <button
              onClick={() => setRailOpen(false)}
              title="Hide marks"
              aria-label="Hide marks"
              style={{
                background: 'transparent', border: 'none', color: 'var(--t3)',
                cursor: 'pointer', padding: 0, display: 'flex',
              }}
            >
              <X size={12} />
            </button>
          </div>
          <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            <HighlightsTab
              highlights={itemHighlights}
              onOpenNote={onOpenNote}
              onDelete={onDeleteHighlight}
              onCreateNote={(hl) => onCreateNoteFromHighlight(hl, activeItem?.title || '')}
            />
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
              type: 'rss', author: null, source: url, progress: 0, excerpt: '', coverUrl: null, status: 'unread',
              content: `# ${url}\n\n*RSS feed content will appear here once fetched.*\n\nFeed URL: ${url}`,
            });
            setShowImport(false);
          }}
          onAddUrl={async (url) => {
            // This used to file the link with a paragraph claiming the article
            // "would be extracted using Mozilla Readability" — a description of
            // work that never happened, saved as though it were the article.
            const host = url.replace(/^https?:\/\//, '').split('/')[0];
            const item = await importArticle({
              id: `url_${Date.now()}`, title: host, author: '', type: 'url',
              source: host, url, score: 0, content: '', time: 0,
            });
            setActiveItemId(item.id);
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
  onAdd, onRead, onClose, onRefresh, openingId,
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
  onRead: (item: FetchedItem) => void | Promise<void>;
  openingId: string | null;
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
            {/* The book's own cover when it has one, pulled out of the epub on
                import. The type badge is the stand-in, not the default. */}
            {item.coverUrl ? (
              <img
                src={item.coverUrl}
                alt=""
                style={{
                  width: 28, height: 40, borderRadius: 2, objectFit: 'cover', flexShrink: 0,
                  background: 'var(--bg3)', boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                }}
              />
            ) : (
              <div style={{ width: 28, height: 40, borderRadius: 2, background: typeInfo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: typeInfo.color, flexShrink: 0 }}>{typeInfo.label}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: isActive ? 'var(--acc2)' : 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
              <div style={{ fontSize: 9, color: 'var(--t3)' }}>{item.author ? `${item.author} · ` : ''}{item.type}</div>
              {(item.type === 'epub' || item.type === 'pdf') && item.progress > 0 && item.status !== 'done' && (
                <div style={{ height: 2, background: 'var(--bg3)', borderRadius: 1, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${item.progress}%`, background: 'var(--acc)', borderRadius: 1 }} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A quiet square control for the reader's one row of chrome. */
function ReaderIconButton({ icon: Icon, label, onClick, disabled }: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        width: 24, height: 24, borderRadius: 4, flexShrink: 0,
        background: 'transparent', border: 'none',
        color: 'var(--t2)', opacity: disabled ? 0.3 : 1,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--t1)'; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)'; } }}
    >
      <Icon size={14} strokeWidth={2} />
    </button>
  );
}



function HighlightsTab({ highlights, onOpenNote, onDelete, onCreateNote }: {
  highlights: Highlight[]; onOpenNote: (id: string) => void; onDelete: (id: string) => void; onCreateNote: (hl: Highlight) => void;
}) {
  if (highlights.length === 0) {
    return (
      <div style={{ fontSize: 11.5, color: 'var(--t3)', lineHeight: 1.7, padding: '10px 2px' }}>
        Select a passage while you read to mark it. Marks show up here, and beside
        the line they came from.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {highlights.map((hl) => (
        <div
          key={hl.id}
          style={{
            borderLeft: `2px solid ${HIGHLIGHT_BORDER[hl.color]}`,
            background: HIGHLIGHT_BG[hl.color],
            borderRadius: '0 4px 4px 0',
            padding: '9px 11px',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--t1)', lineHeight: 1.6, marginBottom: 6 }}>{hl.text}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 10 }}>
            {hl.noteId ? (
              <button
                onClick={() => onOpenNote(hl.noteId!)}
                style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--grn)', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                open the note →
              </button>
            ) : (
              <button
                onClick={() => onCreateNote(hl)}
                style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--acc2)', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                make a note
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => onDelete(hl.id)}
              title="Remove this mark"
              aria-label="Remove this mark"
              style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <X size={11} />
            </button>
          </div>
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
  onAddUrl: (url: string) => void | Promise<void>;
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
