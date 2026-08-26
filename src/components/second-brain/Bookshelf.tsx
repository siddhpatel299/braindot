'use client';

import { useMemo, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { LibraryItem } from '@/types';
import { plural } from '@/utils/markdown';

interface BookshelfProps {
  items: LibraryItem[];
  onOpen: (id: string) => void;
  onAddSource: () => void;
  onFetchNews: () => void;
  onFetchPapers: () => void;
  onBuildEdition: () => void;
  buildingEdition: boolean;
  /** Take a source off the shelf for good. */
  onDelete: (id: string) => void;
}

type ShelfFilter = 'all' | 'reading' | 'unread' | 'done';

const FILTERS: { id: ShelfFilter; label: string; match: (i: LibraryItem) => boolean }[] = [
  { id: 'all', label: 'all', match: () => true },
  { id: 'reading', label: 'reading', match: (i) => i.status === 'reading' },
  { id: 'unread', label: 'not started', match: (i) => i.status === 'unread' },
  { id: 'done', label: 'finished', match: (i) => i.status === 'done' },
];

/**
 * The jacket a book gets when it did not bring one.
 *
 * Not a placeholder and not a file-type badge: a real cover, in the tradition
 * of a publisher's series livery — one field colour per kind, the number of
 * the volume on the shelf, the title set on the boards. You recognise the
 * object before you read the title, which is the whole reason covers exist,
 * and a shelf of grey rectangles gives you nothing to recognise.
 */
const FIELDS: Record<string, { field: string; ink: string; ink2: string }> = {
  epub: { field: '#7b2f2a', ink: '#f6efe6', ink2: 'rgba(246,239,230,0.62)' },
  pdf: { field: '#26445e', ink: '#eaf1f7', ink2: 'rgba(234,241,247,0.62)' },
  rss: { field: '#7d4a15', ink: '#f8efe2', ink2: 'rgba(248,239,226,0.62)' },
  url: { field: '#1f5443', ink: '#e8f4ee', ink2: 'rgba(232,244,238,0.62)' },
  paper: { field: '#26445e', ink: '#eaf1f7', ink2: 'rgba(234,241,247,0.62)' },
  news: { field: '#4a3566', ink: '#f0eaf7', ink2: 'rgba(240,234,247,0.62)' },
};

/** The last word of a name is the one a spine carries. */
function surname(author: string | null): string {
  if (!author) return '';
  const first = author.split(/,|&| and /i)[0].trim();
  const parts = first.split(/\s+/);
  return (parts[parts.length - 1] || first).toUpperCase();
}

function statusLabel(item: LibraryItem): string {
  if (item.status === 'done') return 'finished';
  if (item.progress > 0) return `${Math.round(item.progress)}%`;
  return 'not started';
}

function Jacket({ item, index }: { item: LibraryItem; index: number }) {
  const f = FIELDS[item.type] ?? FIELDS.url;
  return (
    <span className="sb-jacket" style={{ background: '#191714' }}>
      {/* The shadow a bound book throws along its own hinge. */}
      <span className="sb-jacket-hinge" />
      <span style={{ height: 9, background: f.field, flexShrink: 0 }} />
      <span style={{ padding: '16px 15px 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span style={{
          fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6e665c',
        }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span style={{ height: 1, background: '#332f2a' }} />
      </span>
      <span style={{
        marginTop: 'auto', background: f.field, padding: '13px 15px 14px',
        display: 'flex', flexDirection: 'column', gap: 7,
      }}>
        <span className="sb-jacket-title" style={{ color: f.ink }}>{item.title}</span>
        <span className="sb-jacket-author" style={{ color: f.ink2 }}>{surname(item.author)}</span>
      </span>
      <span style={{ height: 9, background: f.field, borderTop: '1px solid rgba(0,0,0,0.25)', flexShrink: 0 }} />
    </span>
  );
}

function Cover({
  item, index, onOpen, onDelete,
}: {
  item: LibraryItem;
  index: number;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="sb-shelf-item">
      <button
        className="sb-shelf-open"
        onClick={() => onOpen(item.id)}
        title={item.title}
      >
        <span className="sb-shelf-cover">
          {item.coverUrl
            ? <img src={item.coverUrl} alt="" className="sb-shelf-img" />
            : <Jacket item={item} index={index} />}

          {item.progress > 0 && item.progress < 100 && (
            <span className="sb-shelf-progress" aria-hidden="true">
              <span style={{ width: `${item.progress}%` }} />
            </span>
          )}
          {item.status === 'done' && (
            <span className="sb-shelf-done" aria-label="Finished">
              <Check size={9} strokeWidth={3.4} />
            </span>
          )}
        </span>
        <span className="sb-shelf-title">{item.title}</span>
        {item.author && <span className="sb-shelf-author">{item.author}</span>}
        <span className="sb-shelf-status">{statusLabel(item)}</span>
      </button>

      {/* Removing a source used to be impossible: anything imported stayed on
          the shelf for good, including a news article opened once by mistake.
          Two presses, because the text and every mark in it go with it. */}
      <button
        className={`sb-shelf-remove${confirming ? ' sb-shelf-remove-armed' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (confirming) { onDelete(item.id); return; }
          setConfirming(true);
          window.setTimeout(() => setConfirming(false), 3000);
        }}
        onMouseLeave={() => setConfirming(false)}
        title={confirming ? 'Press again to remove it and its marks' : `Remove "${item.title}"`}
        aria-label={confirming ? `Confirm removing ${item.title}` : `Remove ${item.title}`}
      >
        {confirming ? 'sure?' : <Trash2 size={11} strokeWidth={1.9} />}
      </button>
    </div>
  );
}

/**
 * The library as a shelf.
 *
 * A list of 11px rows told you a book's filename and nothing about the book.
 * Covers are how anyone actually finds one they own — you recognise the object
 * before you read the title — which is why pulling them out of the epub on
 * import came first, and why a book without one gets a drawn jacket rather
 * than a grey rectangle.
 */
export function Bookshelf({
  items, onOpen, onAddSource, onFetchNews, onFetchPapers,
  onBuildEdition, buildingEdition, onDelete,
}: BookshelfProps) {
  const [filter, setFilter] = useState<ShelfFilter>('all');

  const started = useMemo(
    () => items.filter((i) => i.status === 'reading' && i.progress > 0)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 4),
    [items],
  );

  const shelf = useMemo(() => {
    const match = FILTERS.find((f) => f.id === filter)?.match ?? (() => true);
    return items.filter(match);
  }, [items, filter]);

  if (items.length === 0) {
    return (
      <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 16, color: 'var(--t1)', fontWeight: 600, marginBottom: 10 }}>
            Your shelf is empty
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--t3)', lineHeight: 1.7, margin: '0 0 18px' }}>
            Drop in an EPUB or a PDF and it opens as a book — paged, with your
            marks in the margin. Or build today’s paper from your sources.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="sb-shelf-action sb-shelf-action-primary" onClick={onBuildEdition} disabled={buildingEdition}>
              {buildingEdition ? 'Assembling…' : 'Build today’s paper'}
            </button>
            <button className="sb-shelf-action" onClick={onAddSource}>Add a source</button>
            <button className="sb-shelf-action" onClick={onFetchNews}>Today’s news</button>
            <button className="sb-shelf-action" onClick={onFetchPapers}>Research papers</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '26px 32px 48px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>

        {started.length > 0 && (
          <>
            <div className="sb-shelf-head">
              <span className="sb-shelf-head-label">Continue reading</span>
              <span className="sb-shelf-head-facts">picked up where you stopped</span>
            </div>
            <div className="sb-continue-grid">
              {started.map((item, i) => (
                <button key={item.id} className="sb-continue" onClick={() => onOpen(item.id)}>
                  <span className="sb-continue-cover">
                    {item.coverUrl
                      ? <img src={item.coverUrl} alt="" className="sb-shelf-img" />
                      : <Jacket item={item} index={i} />}
                    <span className="sb-shelf-progress" aria-hidden="true">
                      <span style={{ width: `${item.progress}%` }} />
                    </span>
                  </span>
                  <span className="sb-continue-body">
                    <span className="sb-continue-title">{item.title}</span>
                    {item.author && <span className="sb-continue-author">{item.author}</span>}
                    <span className="sb-continue-bar">
                      <span className="sb-continue-track">
                        <span style={{ width: `${item.progress}%` }} />
                      </span>
                      <span className="sb-continue-pct">{Math.round(item.progress)}%</span>
                    </span>
                    <span className="sb-continue-foot">
                      <span>{plural(item.highlights.length, 'mark')}</span>
                      <span className="sb-continue-resume">resume →</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="sb-shelf-head sb-shelf-head-ruled">
          <span className="sb-shelf-head-label">Your shelf</span>
          <span className="sb-shelf-head-facts">{shelf.length} shown</span>
          <span className="sb-shelf-filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`sb-shelf-filter${filter === f.id ? ' sb-shelf-filter-on' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </span>
        </div>

        {shelf.length === 0 ? (
          <p style={{ padding: '28px 0', fontSize: 12, color: 'var(--t3)' }}>
            Nothing here under that filter.
          </p>
        ) : (
          <div className="sb-shelf-grid">
            {shelf.map((item, i) => (
              <Cover key={item.id} item={item} index={i} onOpen={onOpen} onDelete={onDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
