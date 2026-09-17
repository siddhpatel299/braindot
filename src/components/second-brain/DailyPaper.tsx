'use client';

import { useMemo, useState } from 'react';

export interface PaperStory {
  id: string;
  headline: string;
  standfirst: string;
  paragraphs: string[];
  source: string;
  author: string | null;
  url: string;
  image: string | null;
  minutes: number;
  provenance: 'summary' | 'extract' | 'feed' | 'none';
  note?: string;
}

export interface Edition {
  number: number;
  date: string;
  dateline: string;
  builtAt: string;
  sources: string[];
  minutes: number;
  storyCount: number;
  note: string;
  lead: PaperStory;
  sections: { title: string; stories: PaperStory[] }[];
  briefs: PaperStory[];
}

interface DailyPaperProps {
  edition: Edition;
  onSaveStory: (story: PaperStory) => void;
  onAddSource: () => void;
  /** The way out. Opening the paper used to be one-way: the masthead replaced
   *  the whole reading view and nothing on it went back to the shelf. */
  onClose: () => void;
  /** Books part-read, shown in the rail beside the lead. */
  shelf: { title: string; progress: number; highlights: number }[];
}

const SIZES = [
  { label: 'small', px: 15 },
  { label: 'medium', px: 16.5 },
  { label: 'large', px: 18.5 },
];

/** Marks a run of text as apparatus, so CSS sets it in the typewriter face. */
const AP = 'sb-paper-ap';

/** The small tracked capitals that label every part of the paper. */
const label = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  fontSize: '0.6em',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--t3)',
  ...extra,
});

const PROVENANCE: Record<PaperStory['provenance'], string> = {
  summary: 'summarised from the article',
  extract: 'opening paragraphs, as published',
  feed: 'as filed by the wire',
  none: 'headline only',
};

function StoryActions({ story, onSave }: { story: PaperStory; onSave: () => void }) {
  const host = (() => { try { return new URL(story.url).hostname.replace(/^www\./, ''); } catch { return story.source; } })();
  return (
    <div className={AP} style={{
      display: 'flex', alignItems: 'center', gap: 16, marginTop: 20, paddingTop: 12,
      borderTop: '1px solid var(--hair)', ...label({ fontSize: '0.62em', letterSpacing: '0.08em' }),
    }}>
      <a href={story.url} target="_blank" rel="noreferrer noopener"
        style={{ color: 'var(--t3)', textDecoration: 'none' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; }}>
        {host} ↗
      </a>
      <button onClick={onSave}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--t3)', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; }}>
        save to notes
      </button>
      <span style={{ marginLeft: 'auto', color: 'var(--t3)' }}>{PROVENANCE[story.provenance]}</span>
    </div>
  );
}

/** A rule with a section name sitting on it. */
function SectionRule({ title, count }: { title: string; count: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 44, padding: '9px 0',
      borderTop: '2px solid var(--rule)', borderBottom: '1px solid var(--rule)',
    }}>
      <span className={AP} style={label({ fontSize: '0.64em', letterSpacing: '0.2em', color: 'var(--t1)', fontWeight: 600 })}>{title}</span>
      <span className={AP} style={label({ fontSize: '0.58em', letterSpacing: '0.1em', marginLeft: 'auto' })}>{count}</span>
    </div>
  );
}

/**
 * The edition, set as a paper.
 *
 * Everything else in the app is chrome around a document; this is the one
 * screen that *is* the document, so it gets its own face — Source Serif for
 * the copy, the app's typewriter face for every piece of apparatus around it
 * (folio, datelines, credits, section rules). That contrast is what makes it
 * read as a printed page rather than a feed.
 */
export function DailyPaper({ edition, onSaveStory, onAddSource, onClose, shelf }: DailyPaperProps) {
  const [sizeIdx, setSizeIdx] = useState(1);
  const size = SIZES[sizeIdx];

  // The rail lists everything in the paper, in printing order.
  const inside = useMemo(
    () => [edition.lead, ...edition.sections.flatMap((s) => s.stories)],
    [edition],
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* The paper's own bar: what this edition is, and how to read it. */}
      <div style={{
        height: 44, flexShrink: 0, background: 'var(--bg1)', borderBottom: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', padding: '0 18px', gap: 14,
      }}>
        <button
          onClick={onClose}
          title="Back to the library"
          style={{
            height: 24, padding: '0 9px 0 7px', borderRadius: 4, background: 'transparent',
            border: 'none', color: 'var(--t2)', cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 10.5,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--t1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)'; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="m16 6 4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" />
          </svg>
          library
        </button>
        <span style={{ width: 1, height: 15, background: 'var(--bd)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', whiteSpace: 'nowrap' }}>
          today’s paper
        </span>
        <span style={{
          fontSize: 10.5, color: 'var(--t3)', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
        }}>
          edition {edition.number} · {edition.storyCount} stories from {edition.sources.length} sources · {edition.minutes} min
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => setSizeIdx((i) => (i + 1) % SIZES.length)}
            style={{
              height: 28, padding: '0 11px', borderRadius: 5, border: '1px solid var(--bd2)',
              background: 'transparent', color: 'var(--t2)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.borderColor = 'var(--acc-bd)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t2)'; e.currentTarget.style.borderColor = 'var(--bd2)'; }}
          >
            type · {size.label}
          </button>
          <span style={{ width: 1, height: 18, background: 'var(--bd)', flexShrink: 0 }} />
          <button
            onClick={onAddSource}
            style={{
              height: 28, padding: '0 11px', borderRadius: 5, border: '1px solid var(--acc-bd)',
              background: 'var(--acc-bg)', color: 'var(--acc2)', fontSize: 11, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            + add source
          </button>
        </div>
      </div>

      <div className="sb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)' }}>
        <div style={{ fontSize: size.px }}>
          <div className="sb-paper" style={{
            maxWidth: 1180, margin: '0 auto', padding: '44px 52px 72px',
            background: 'var(--paper)',
          }}>
            {/* Masthead */}
            <div style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 24 }}>
                <span className={AP} style={label({ fontSize: '0.62em' })}>no. {edition.number}</span>
                <div style={{
                  fontSize: '3.1em', fontWeight: 600, letterSpacing: '-0.015em',
                  lineHeight: 1, color: 'var(--t1)',
                }}>
                  The Braindot Edition
                </div>
                <span className={AP} style={label({ fontSize: '0.62em' })}>{edition.minutes} min</span>
              </div>
            </div>
            <div className={AP} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
              borderBottom: '2px solid var(--rule)', padding: '7px 0 9px',
              ...label({ fontSize: '0.6em', letterSpacing: '0.14em', color: 'var(--t2)' }),
            }}>
              <span>{edition.dateline}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {edition.sources.join(' · ')}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>built {edition.builtAt} from your feeds</span>
            </div>

            {/* Front page: the lead, and the rail */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.3fr) minmax(0,1fr)', marginTop: 30 }}>
              <div style={{ paddingRight: 38 }}>
                <div className={AP} style={label({ color: 'var(--acc2)', marginBottom: 12 })}>
                  Lead · {edition.lead.source}
                </div>
                <h1 style={{
                  margin: '0 0 16px', fontSize: '2.7em', lineHeight: 1.04, fontWeight: 600,
                  letterSpacing: '-0.02em', color: 'var(--t1)', textWrap: 'pretty',
                }}>
                  {edition.lead.headline}
                </h1>
                {edition.lead.standfirst && (
                  <p style={{
                    margin: '0 0 22px', fontSize: '1.22em', lineHeight: 1.45, color: 'var(--t2)',
                    fontStyle: 'italic', textWrap: 'pretty',
                  }}>
                    {edition.lead.standfirst}
                  </p>
                )}
                {edition.lead.image && (
                  <figure style={{ margin: '0 0 24px' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={edition.lead.image}
                      alt=""
                      style={{ width: '100%', aspectRatio: '16 / 7', objectFit: 'cover', display: 'block', border: '1px solid var(--bd)' }}
                    />
                    <figcaption className={AP} style={label({ fontSize: '0.58em', letterSpacing: '0.06em', marginTop: 8 })}>
                      Picture published with the article · {edition.lead.source}
                    </figcaption>
                  </figure>
                )}
                {/* The lead runs in two columns, as a lead does. */}
                <div style={{ columns: 2, columnGap: 34, columnRule: '1px solid var(--hair)' }}>
                  {edition.lead.paragraphs.map((p, i) => (
                    <p key={i} style={{
                      margin: i === edition.lead.paragraphs.length - 1 ? 0 : '0 0 14px',
                      fontSize: '1.02em', lineHeight: 1.62, color: 'var(--t1)',
                      textWrap: 'pretty',
                    }}>
                      {i === 0 && (
                        <span className={AP} style={label({ fontSize: '0.72em', letterSpacing: '0.1em' })}>
                          {edition.lead.source} —{' '}
                        </span>
                      )}
                      {p}
                    </p>
                  ))}
                </div>
                {edition.lead.note && (
                  <p className={AP} style={{ ...label({ fontSize: '0.62em' }), marginTop: 14 }}>{edition.lead.note}</p>
                )}
                <StoryActions story={edition.lead} onSave={() => onSaveStory(edition.lead)} />
              </div>

              <div style={{ paddingLeft: 32, borderLeft: '1px solid var(--hair)' }}>
                <div className={AP} style={{
                  ...label({ color: 'var(--t1)' }),
                  paddingBottom: 10, borderBottom: '2px solid var(--rule)',
                }}>
                  Inside today
                </div>
                {inside.map((s, i) => (
                  <a
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{
                      display: 'block', padding: '14px 0', borderBottom: '1px solid var(--hair)',
                      color: 'var(--t1)', textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
                  >
                    <div style={{ display: 'flex', gap: 10 }}>
                      <span className={AP} style={label({ fontSize: '0.62em', letterSpacing: 0, paddingTop: '0.25em' })}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <div style={{ fontSize: '0.98em', lineHeight: 1.32, fontWeight: 600 }}>
                          {s.headline}
                        </div>
                        <div className={AP} style={label({ fontSize: '0.58em', letterSpacing: '0.08em', marginTop: 5 })}>
                          {s.source} · {s.minutes} min
                        </div>
                      </div>
                    </div>
                  </a>
                ))}

                {shelf.length > 0 && (
                  <>
                    <div className={AP} style={{
                      ...label({ color: 'var(--t1)' }),
                      padding: '26px 0 10px', borderBottom: '2px solid var(--rule)',
                    }}>
                      Still on your shelf
                    </div>
                    {shelf.map((b, i) => (
                      <div key={i} style={{ padding: '13px 0', borderBottom: i === shelf.length - 1 ? 'none' : '1px solid var(--hair)' }}>
                        <div style={{ fontSize: '0.94em', lineHeight: 1.35 }}>{b.title}</div>
                        <div className={AP} style={label({ fontSize: '0.58em', letterSpacing: '0.08em', marginTop: 5 })}>
                          {b.progress}%{b.highlights ? ` · ${b.highlights} highlight${b.highlights === 1 ? '' : 's'}` : ''}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* The sections */}
            {edition.sections.map((section) => (
              <div key={section.title}>
                <SectionRule
                  title={section.title}
                  count={`${section.stories.length} ${section.stories.length === 1 ? 'story' : 'stories'} · ${section.stories.reduce((n, s) => n + s.minutes, 0)} min`}
                />
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: section.stories.length === 1 ? '1fr' : '1fr 1fr',
                  marginTop: 26,
                }}>
                  {section.stories.map((s, i) => (
                    <div
                      key={s.id}
                      style={{
                        paddingRight: i % 2 === 0 && section.stories.length > 1 ? 34 : 0,
                        paddingLeft: i % 2 === 1 ? 34 : 0,
                        borderLeft: i % 2 === 1 ? '1px solid var(--hair)' : undefined,
                        marginBottom: 26,
                      }}
                    >
                      <div className={AP} style={label({ fontSize: '0.58em', color: 'var(--acc2)', marginBottom: 10 })}>
                        {s.source}
                      </div>
                      <h2 style={{
                        margin: '0 0 12px', fontSize: '1.62em', lineHeight: 1.14, fontWeight: 600,
                        letterSpacing: '-0.012em', color: 'var(--t1)', textWrap: 'pretty',
                      }}>
                        {s.headline}
                      </h2>
                      {s.standfirst && (
                        <p style={{ margin: '0 0 12px', fontSize: '0.98em', lineHeight: 1.6, color: 'var(--t1)', textWrap: 'pretty' }}>
                          {s.standfirst}
                        </p>
                      )}
                      {s.paragraphs.slice(0, 2).map((p, j) => (
                        <p key={j} style={{ margin: '0 0 12px', fontSize: '0.98em', lineHeight: 1.6, color: 'var(--t2)', textWrap: 'pretty' }}>
                          {p}
                        </p>
                      ))}
                      {s.note && <p className={AP} style={{ ...label({ fontSize: '0.6em' }), margin: '0 0 12px' }}>{s.note}</p>}
                      <StoryActions story={s} onSave={() => onSaveStory(s)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* In brief */}
            {edition.briefs.length > 0 && (
              <>
                <SectionRule title="In brief" count={`${edition.briefs.length} items`} />
                <div style={{ columns: 2, columnGap: 38, marginTop: 22 }}>
                  {edition.briefs.map((b) => (
                    <div key={b.id} style={{ breakInside: 'avoid', marginBottom: 16 }}>
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        style={{ color: 'var(--t1)', textDecoration: 'none', fontSize: '1em', lineHeight: 1.4, fontWeight: 600 }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc2)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
                      >
                        {b.headline}
                      </a>
                      {b.standfirst && (
                        <p style={{ margin: '5px 0 0', fontSize: '0.9em', lineHeight: 1.5, color: 'var(--t2)' }}>
                          {b.standfirst}
                        </p>
                      )}
                      <div className={AP} style={label({ fontSize: '0.56em', letterSpacing: '0.1em', marginTop: 5 })}>{b.source}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className={AP} style={{
              display: 'flex', alignItems: 'center', gap: 18, marginTop: 52, paddingTop: 12,
              borderTop: '1px solid var(--rule)', ...label({ fontSize: '0.58em', letterSpacing: '0.1em' }),
            }}>
              <span>End of edition {edition.number}</span>
              <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: '0.04em' }}>{edition.note}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
