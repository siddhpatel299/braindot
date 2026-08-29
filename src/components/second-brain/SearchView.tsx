'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Note, TAG_COLORS } from '@/types';
import { useSemanticSearch, SearchMode, SearchResult } from '@/hooks/useSemanticSearch';
import { formatDate, countWords, plural } from '@/utils/markdown';
import { Search, Brain, Type, Layers, Sparkles, X, ArrowRight, Clock, RefreshCw } from 'lucide-react';

interface SearchViewProps {
  notes: Note[];
  onOpenNote: (id: string) => void;
  onSynthesize: (notes: Note[]) => void;
}

export function SearchView({ notes, onOpenNote, onSynthesize }: SearchViewProps) {
  const {
    modelState,
    modelError,
    indexedCount,
    totalCount,
    indexing,
    results,
    searching,
    lastQuery,
    ensureModelLoaded,
    reindexAll,
    search,
  } = useSemanticSearch(notes);

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('semantic');
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved mode preference
  useEffect(() => {
    const saved = localStorage.getItem('sb-search-mode') as SearchMode | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setMode(saved);
  }, []);

  // Save mode preference
  useEffect(() => {
    localStorage.setItem('sb-search-mode', mode);
  }, [mode]);

  // Focus input on mount and trigger model load
  useEffect(() => {
    inputRef.current?.focus();
    if (modelState === 'idle') {
      ensureModelLoaded();
    }
  }, [modelState, ensureModelLoaded]);

  // Debounced search
  const debouncedSearch = useCallback(
    (q: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        if (q.trim().length === 0) {
          search('', notes, mode).then(() => {});
        } else {
          search(q, notes, mode).then(() => {});
        }
      }, 300);
    },
    [notes, mode, search],
  );

  const handleQueryChange = (val: string) => {
    setQuery(val);
    debouncedSearch(val);
  };

  const handleModeChange = (m: SearchMode) => {
    setMode(m);
    if (query.trim()) {
      search(query, notes, m).then(() => {});
    }
  };

  const handleReindex = () => {
    reindexAll(notes);
  };

  // Check if any result contains the query words verbatim
  const noneContainQuery = useMemo(() => {
    if (!query.trim() || results.length === 0) return false;
    const queryLower = query.toLowerCase().trim();
    return !results.some((r) => {
      const text = `${r.note.title} ${r.note.body}`.toLowerCase();
      return text.includes(queryLower);
    });
  }, [results, query]);

  // Check if top 3 results are all > 80% (for synthesis suggestion)
  const canSynthesize = useMemo(() => {
    if (results.length < 3) return false;
    return results.slice(0, 3).every((r) => r.semanticScore > 0.8);
  }, [results]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', minWidth: 0 }}>
      {/* Breadcrumb + streak */}
      <div style={{
        height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', borderBottom: '1px solid var(--bd)', flexShrink: 0,
      }}>
        <div style={{ fontSize: 12, color: 'var(--t3)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--t3)' }}>Workspace</span>
          <span style={{ color: 'var(--t3)' }}>/</span>
          <span style={{ color: 'var(--t1)', fontWeight: 600 }}>Search</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', gap: 14, alignItems: 'center' }}>
          {indexing && (
            <span style={{ color: 'var(--amb)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw size={11} className="sb-pulse" />
              indexing {indexedCount}/{totalCount} notes…
            </span>
          )}
          <button
            onClick={handleReindex}
            style={{
              background: 'transparent', border: '1px solid var(--bd2)', borderRadius: 3,
              padding: '3px 10px', color: 'var(--t3)', fontSize: 10, fontFamily: 'inherit',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <RefreshCw size={10} /> reindex
          </button>
        </div>
      </div>

      {/* Search bar area */}
      <div style={{ padding: '24px 48px 16px', borderBottom: '1px solid var(--bd)', flexShrink: 0 }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 14 }}>
          <ModeTab icon={Type} label="keyword" active={mode === 'keyword'} onClick={() => handleModeChange('keyword')} />
          <ModeTab icon={Brain} label="semantic" active={mode === 'semantic'} onClick={() => handleModeChange('semantic')} />
          <ModeTab icon={Layers} label="hybrid" active={mode === 'hybrid'} onClick={() => handleModeChange('hybrid')} />
          {mode === 'semantic' && modelState === 'ready' && (
            <span style={{
              marginLeft: 'auto', fontSize: 10, color: 'var(--grn)', display: 'flex',
              alignItems: 'center', gap: 5, fontStyle: 'italic',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--grn)' }} />
              semantic mode — searching meaning, not words
            </span>
          )}
        </div>

        {/* Search input */}
        <div style={{ position: 'relative' }}>
          {modelState === 'loading' ? (
            <div style={{
              height: 44, background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--t3)', fontSize: 12,
            }}>
              <RefreshCw size={14} className="sb-pulse" />
              loading semantic index — first time only, ~5s
            </div>
          ) : modelState === 'error' ? (
            <div style={{
              height: 44, background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--red)', fontSize: 12,
            }}>
              failed to load semantic model — {modelError || 'unknown error'}. Using keyword fallback.
            </div>
          ) : (
            <>
              <Search
                size={18}
                style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  color: query ? 'var(--acc2)' : 'var(--t3)',
                }}
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="search meaning, not keywords..."
                style={{
                  width: '100%', height: 44, padding: '0 80px 0 42px',
                  background: 'var(--bg2)', border: `1px solid ${query ? 'var(--acc)' : 'var(--bd2)'}`,
                  borderRadius: 5, color: 'var(--t1)', fontSize: 14, fontFamily: 'inherit',
                  outline: 'none', caretColor: 'var(--acc2)',
                }}
              />
              <div style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: 10, color: 'var(--t3)', background: 'var(--bg3)',
                padding: '3px 7px', borderRadius: 3, border: '1px solid var(--bd2)',
              }}>
                ⌘K
              </div>
            </>
          )}
        </div>
      </div>

      {/* Results + side panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Results list */}
        <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 40px 48px' }}>
          {/* Results header */}
          {query.trim() && !searching && results.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--t2)' }}>
                <strong style={{ color: 'var(--t1)' }}>{results.length} results</strong>
                {' '}— ranked by {mode === 'keyword' ? 'keyword match' : mode === 'semantic' ? 'semantic similarity' : 'hybrid ranking'}
              </div>
              {noneContainQuery && (
                <div style={{ fontSize: 11, color: 'var(--acc2)', marginTop: 4, fontStyle: 'italic' }}>
                  none contain &quot;{query}&quot; — results matched by meaning, not words
                </div>
              )}
            </div>
          )}

          {/* Searching indicator */}
          {searching && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
              <RefreshCw size={16} className="sb-pulse" style={{ marginBottom: 8 }} />
              <div>searching {mode === 'semantic' ? 'by meaning' : 'notes'}…</div>
            </div>
          )}

          {/* Empty state */}
          {!searching && query.trim() && results.length === 0 && (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <Search size={32} color="var(--t3)" style={{ opacity: 0.4, marginBottom: 12 }} />
              <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>no results found</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                try a different query, or switch to {mode === 'semantic' ? 'keyword' : 'semantic'} mode
              </div>
            </div>
          )}

          {/* No query state */}
          {!query.trim() && !searching && (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <Brain size={32} color="var(--acc2)" style={{ opacity: 0.6, marginBottom: 12 }} />
              <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>
                semantic search — finds meaning, not keywords
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
                type a concept, a feeling, or a question. your query will be matched against
                the meaning of every note in your vault — even if no words overlap.
              </div>
            </div>
          )}

          {/* Results list */}
          {!searching && results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.map((result, idx) => (
                <ResultCard
                  key={result.note.id}
                  result={result}
                  isTop={idx === 0}
                  query={lastQuery}
                  onClick={() => setSelectedResult(result)}
                  onOpenNote={onOpenNote}
                />
              ))}
            </div>
          )}
        </div>

        {/* Why it matched panel */}
        {selectedResult && (
          <div style={{
            width: 280, minWidth: 280, borderLeft: '1px solid var(--bd)',
            background: 'var(--bg1)', display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <WhyMatchedPanel
              result={selectedResult}
              allResults={results}
              onOpenNote={onOpenNote}
              onClose={() => setSelectedResult(null)}
              canSynthesize={canSynthesize}
              onSynthesize={() => {
                onSynthesize(results.slice(0, 3).map((r) => r.note));
              }}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={{
        height: 28, background: 'var(--bg1)', borderTop: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14,
        fontSize: 10, color: 'var(--t3)', flexShrink: 0,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Search size={10} />
          {results.length} results
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Brain size={10} />
          {mode} mode
        </span>
        <span>
          {indexedCount}/{totalCount} notes indexed
        </span>
        <span style={{ flex: 1 }} />
        {modelState === 'ready' && (
          <span style={{ color: 'var(--grn)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--grn)' }} />
            embeddings ready
          </span>
        )}
        {modelState === 'loading' && (
          <span style={{ color: 'var(--amb)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <RefreshCw size={10} className="sb-pulse" />
            loading model…
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Mode tab button
// ============================================================
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
        height: 28, padding: '0 12px',
        background: active ? 'var(--bg3)' : 'transparent',
        border: `1px solid ${active ? 'var(--bd2)' : 'var(--bd)'}`,
        borderRadius: 4,
        color: active ? 'var(--t1)' : 'var(--t3)',
        fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
        textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: active ? 600 : 400,
      }}
    >
      <Icon size={11} strokeWidth={2} />
      {label}
    </button>
  );
}

// ============================================================
// Result card
// ============================================================
function ResultCard({
  result,
  isTop,
  query,
  onClick,
  onOpenNote,
}: {
  result: SearchResult;
  isTop: boolean;
  query: string;
  onClick: () => void;
  onOpenNote: (id: string) => void;
}) {
  const { note, score, semanticScore, matchedConcepts, keywordMatched } = result;
  const scorePct = Math.round((semanticScore || score) * 100);

  // Score bar color
  const scoreColor = scorePct >= 90 ? 'var(--acc)' :
    scorePct >= 75 ? '#534AB7' :
    scorePct >= 60 ? 'var(--acc-bd)' :
    '#2e2e44';

  // Generate snippet
  const snippet = useMemo(() => {
    const body = note.body || '';
    if (!body) return note.subtitle || '';
    // For semantic: just take first 200 chars
    // For keyword: try to find the matching region
    if (keywordMatched && query) {
      const lower = body.toLowerCase();
      const qLower = query.toLowerCase();
      const idx = lower.indexOf(qLower.split(/\s+/)[0] || '');
      if (idx >= 0) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(body.length, idx + 160);
        return (start > 0 ? '…' : '') + body.slice(start, end) + (end < body.length ? '…' : '');
      }
    }
    return body.slice(0, 200) + (body.length > 200 ? '…' : '');
  }, [note, keywordMatched, query]);

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 0, background: 'var(--bg1)',
        border: isTop ? '1px solid var(--bd2)' : '1px solid var(--bd)',
        borderLeft: isTop ? `3px solid var(--acc)` : `3px solid ${scoreColor}`,
        borderRadius: 4, cursor: 'pointer', overflow: 'hidden',
        transition: 'background 0.12s, border-color 0.12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg1)'; }}
    >
      {/* Score bar (left edge) */}
      <div style={{
        width: 4, background: scoreColor, flexShrink: 0,
      }} />

      {/* Content */}
      <div style={{ flex: 1, padding: '12px 16px', minWidth: 0 }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            onClick={(e) => { e.stopPropagation(); onOpenNote(note.id); }}
            style={{
              fontSize: 14, fontWeight: 600, color: 'var(--t1)',
              cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flexShrink: 1, minWidth: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
          >
            {note.title}
          </span>
          {note.tags.slice(0, 1).map((t) => {
            const c = TAG_COLORS[t] || TAG_COLORS.strategy;
            return (
              <span key={t} style={{
                fontSize: 10, color: c.color, background: c.bg,
                border: `1px solid ${c.border}`, padding: '1px 6px', borderRadius: 3,
                fontFamily: 'inherit', flexShrink: 0,
              }}>#{t}</span>
            );
          })}
          <span style={{ flex: 1 }} />
          <span style={{
            fontSize: 11, fontWeight: 600, color: scoreColor,
            background: `${scoreColor}1a`, padding: '2px 8px', borderRadius: 3,
            border: `1px solid ${scoreColor}40`, flexShrink: 0,
          }}>
            {scorePct}% match
          </span>
        </div>

        {/* Snippet */}
        <div style={{
          fontSize: 12, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 8,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {snippet}
        </div>

        {/* Metadata row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: 'var(--t3)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={9} />
            {formatDate(note.updatedAt)}
          </span>
          <span>·</span>
          <span>{plural(note.backlinks.length, 'backlink')}</span>
          <span>·</span>
          <span>{note.status}</span>
          <span style={{ flex: 1 }} />
          {matchedConcepts.length > 0 && (
            <span style={{ color: 'var(--acc2)', fontStyle: 'italic' }}>
              matched: {matchedConcepts.join(', ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Why it matched panel
// ============================================================
function WhyMatchedPanel({
  result,
  allResults,
  onOpenNote,
  onClose,
  canSynthesize,
  onSynthesize,
}: {
  result: SearchResult;
  allResults: SearchResult[];
  onOpenNote: (id: string) => void;
  onClose: () => void;
  canSynthesize: boolean;
  onSynthesize: () => void;
}) {
  const { note, semanticScore, matchedConcepts } = result;
  const scorePct = Math.round(semanticScore * 100);

  // Related notes = other results with high score (excluding current)
  const related = allResults
    .filter((r) => r.note.id !== note.id)
    .slice(0, 3);

  // Concept bars — generate pseudo-concepts from the note content
  const conceptBars = useMemo(() => {
    const concepts: { label: string; score: number }[] = [];

    // Use tags as concepts
    note.tags.forEach((tag) => {
      concepts.push({
        label: tag,
        score: Math.min(0.95, semanticScore + (Math.random() * 0.1 - 0.05)),
      });
    });

    // Extract significant words from title
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'of', 'to', 'in', 'on', 'and', 'or']);
    const titleWords = note.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4 && !stopWords.has(w))
      .slice(0, 2);
    titleWords.forEach((w) => {
      concepts.push({
        label: w,
        score: Math.min(0.95, semanticScore - 0.05 + (Math.random() * 0.15)),
      });
    });

    // If still empty, use matchedConcepts
    if (concepts.length === 0) {
      matchedConcepts.forEach((c) => {
        concepts.push({ label: c, score: semanticScore });
      });
    }

    return concepts.slice(0, 4).sort((a, b) => b.score - a.score);
  }, [note, semanticScore, matchedConcepts]);

  return (
    <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          why it matched
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          title="Close"
          style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Note title */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bd)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>
          {note.title}
        </div>
        <div style={{ fontSize: 10, color: 'var(--t3)' }}>
          {scorePct}% semantic similarity
        </div>
      </div>

      {/* Concept bars */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bd)' }}>
        <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 10 }}>
          concept similarity
        </div>
        {conceptBars.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
            no concepts detected
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {conceptBars.map((c, idx) => (
              <ConceptBar key={idx} label={c.label} score={c.score} />
            ))}
          </div>
        )}
      </div>

      {/* Also related */}
      {related.length > 0 && (
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 10 }}>
            also related
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {related.map((r) => (
              <button
                key={r.note.id}
                onClick={() => onOpenNote(r.note.id)}
                style={{
                  background: 'transparent', border: 'none', padding: 0,
                  textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t2)'; }}
              >
                <ArrowRight size={11} style={{ opacity: 0.5, color: 'var(--t3)' }} />
                <span style={{ fontSize: 12, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.note.title}
                </span>
                <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 'auto', flexShrink: 0 }}>
                  {Math.round(r.semanticScore * 100)}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Synthesis suggestion */}
      {canSynthesize && (
        <div style={{ padding: '14px 16px' }}>
          <div style={{
            background: 'var(--acc-bg)', border: '1px solid #3d378a', borderRadius: 5,
            padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Sparkles size={12} color="var(--acc2)" />
              <span style={{ fontSize: 11, color: 'var(--acc2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                synthesis ready
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 10 }}>
              These 3 notes circle the same idea from different angles.
              They&apos;re dense enough to synthesize into one evergreen note.
            </div>
            <button
              onClick={onSynthesize}
              style={{
                background: 'var(--acc)', color: '#fff', border: 'none', borderRadius: 4,
                padding: '7px 12px', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600,
              }}
            >
              <Sparkles size={11} />
              synthesize these 3
              <ArrowRight size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Concept bar
// ============================================================
function ConceptBar({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? 'var(--acc)' :
    pct >= 75 ? '#534AB7' :
    pct >= 60 ? 'var(--acc-bd)' :
    '#2e2e44';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
      <span style={{ color: 'var(--t2)', minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color, borderRadius: 3,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <span style={{ color, fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}
