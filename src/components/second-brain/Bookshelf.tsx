'use client';

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
}

/** A book with no cover still needs a face. Its spine is drawn from the type. */
const SPINE: Record<string, { label: string; tint: string }> = {
  epub: { label: 'Book', tint: 'var(--acc)' },
  pdf: { label: 'Paper', tint: 'var(--blu)' },
  rss: { label: 'Feed', tint: 'var(--coral)' },
  url: { label: 'Article', tint: 'var(--grn)' },
};

const SECTIONS: { key: string; title: string; match: (i: LibraryItem) => boolean }[] = [
  { key: 'reading', title: 'Reading now', match: (i) => i.status === 'reading' },
  { key: 'books', title: 'Books', match: (i) => i.type === 'epub' && i.status !== 'reading' && i.status !== 'done' },
  { key: 'papers', title: 'Papers', match: (i) => i.type === 'pdf' && i.status !== 'reading' && i.status !== 'done' },
  { key: 'articles', title: 'Articles', match: (i) => (i.type === 'url' || i.type === 'rss') && i.status !== 'reading' && i.status !== 'done' },
  { key: 'done', title: 'Finished', match: (i) => i.status === 'done' },
];

function Cover({ item, onOpen }: { item: LibraryItem; onOpen: (id: string) => void }) {
  const spine = SPINE[item.type] ?? SPINE.url;
  return (
    <button className="sb-shelf-item" onClick={() => onOpen(item.id)} title={item.title}>
      <span className="sb-shelf-cover" style={{ borderColor: item.coverUrl ? 'transparent' : 'var(--bd2)' }}>
        {item.coverUrl ? (
          <img src={item.coverUrl} alt="" className="sb-shelf-img" />
        ) : (
          // No cover: set the title on the boards, the way an unjacketed book
          // carries it — rather than showing a file-type badge.
          <span className="sb-shelf-blank" style={{ borderTopColor: spine.tint }}>
            <span className="sb-shelf-blank-kind" style={{ color: spine.tint }}>{spine.label}</span>
            <span className="sb-shelf-blank-title">{item.title}</span>
          </span>
        )}
        {item.progress > 0 && item.progress < 100 && (
          <span className="sb-shelf-progress" aria-hidden="true">
            <span style={{ width: `${item.progress}%` }} />
          </span>
        )}
      </span>
      <span className="sb-shelf-title">{item.title}</span>
      {item.author && <span className="sb-shelf-author">{item.author}</span>}
    </button>
  );
}

/**
 * The library as a shelf.
 *
 * A list of 11px rows told you a book's filename and nothing about the book.
 * Covers are how anyone actually finds one they own — you recognise the object
 * before you read the title — which is why pulling them out of the epub on
 * import came first.
 */
export function Bookshelf({ items, onOpen, onAddSource, onFetchNews, onFetchPapers, onBuildEdition, buildingEdition }: BookshelfProps) {
  if (items.length === 0) {
    return (
      <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 16, color: 'var(--t1)', fontWeight: 600, marginBottom: 10 }}>
            Your shelf is empty
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--t3)', lineHeight: 1.7, margin: '0 0 18px' }}>
            Add an epub, a paper or an article, or pull in today’s news. Anything
            you highlight while reading can become a note.
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

  const used = new Set<string>();
  const sections = SECTIONS.map((s) => {
    const list = items.filter((i) => !used.has(i.id) && s.match(i));
    list.forEach((i) => used.add(i.id));
    return { ...s, list };
  }).filter((s) => s.list.length > 0);

  return (
    <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '30px 40px 60px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        {sections.map((section) => (
          <section key={section.key} style={{ marginBottom: 38 }}>
            <h2 style={{
              fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
              color: 'var(--t3)', fontWeight: 600, margin: '0 0 16px',
              display: 'flex', alignItems: 'baseline', gap: 8,
            }}>
              {section.title}
              <span style={{ letterSpacing: 0, textTransform: 'none', opacity: 0.7 }}>
                {plural(section.list.length, 'item')}
              </span>
            </h2>
            <div className="sb-shelf-grid">
              {section.list.map((item) => (
                <Cover key={item.id} item={item} onOpen={onOpen} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
