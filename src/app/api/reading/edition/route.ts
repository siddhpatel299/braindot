import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { collectNews, type FeedItem } from '../news/route';
import { readArticle } from '@/utils/readArticle';
import { EDITION_MARKER, EDITION_TEXT_MARKER } from '@/utils/serverHtml';
import { guard, DAY } from '@/lib/apiGuard';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** A paper is a thing you read once a day, so this is not a tight cap — it is
 *  a ceiling on what a loop could spend overnight. */
const EDITION_QUOTA = { user: 5, userWindowMs: DAY, anon: 1, anonWindowMs: DAY };

/** How many stories the paper carries, and how the sections are laid out. */
const PLAN = {
  read: 8,      // stories fetched and written up in full
  briefs: 6,
};

/**
 * The sections of the paper, in printing order.
 *
 * Every one is guaranteed at least `min` stories if its sources produced any,
 * so a busy wire day cannot squeeze a whole section off the page — technology
 * was being crowded out by world news before this existed.
 */
const SECTIONS: { key: string; title: string; from: string[]; min: number }[] = [
  { key: 'world', title: 'World & Business', from: ['world', 'business'], min: 2 },
  { key: 'tech', title: 'Technology', from: ['tech'], min: 2 },
  { key: 'science', title: 'Science', from: ['science'], min: 1 },
];
/** Words of source text handed to the summariser per story. */
const SOURCE_WORD_CAP = 900;

interface Story extends FeedItem {
  section: string;
  /** Full text we actually fetched. Empty when the page could not be read. */
  body: string;
  /** Why it could not be read, printed with the brief. */
  unread?: string;
  summary?: string;
}

/**
 * Rank the day's candidates.
 *
 * Recency dominates — a newspaper is a snapshot of today — with a nudge for
 * stories the wires all carried and, on Hacker News, for what readers voted up.
 */
function rank(items: Story[]): Story[] {
  const now = Date.now() / 1000;
  return [...items].sort((a, b) => score(b) - score(a));
  function score(s: Story) {
    const ageHours = s.time ? (now - s.time) / 3600 : 48;
    const freshness = Math.max(0, 36 - ageHours) / 36;
    const votes = s.score ? Math.min(1, Math.log10(s.score + 1) / 3) : 0;
    return freshness * 2 + votes;
  }
}

/**
 * Spread the front page across outlets.
 *
 * Straight ranking handed the whole page to whichever source posted most
 * recently — one site's afternoon filling every slot. Taking the best
 * remaining story from a different outlet each time keeps a front page that
 * looks like a newspaper's rather than a feed's.
 */
function spread(ranked: Story[], count: number): Story[] {
  const chosen: Story[] = [];
  const used = new Map<string, number>();
  const pool = [...ranked];
  while (chosen.length < count && pool.length) {
    const fewest = Math.min(...pool.map((s) => used.get(s.source) ?? 0));
    const idx = pool.findIndex((s) => (used.get(s.source) ?? 0) === fewest);
    const [picked] = pool.splice(idx === -1 ? 0 : idx, 1);
    chosen.push(picked);
    used.set(picked.source, (used.get(picked.source) ?? 0) + 1);
  }
  return chosen;
}

/**
 * The article's own opening, for when there is no summariser.
 *
 * Printing the publisher's first paragraphs verbatim is honest and useful —
 * it is wire copy, which is what a paper runs anyway — and it means the
 * edition is worth reading with no API key at all.
 */
function openingExtract(markdown: string, words: number): string {
  const prose = markdown
    .split('\n\n')
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith('#') && !b.startsWith('![') && !b.startsWith('>'))
    .join(' ');
  const taken = prose.split(/\s+/).slice(0, words).join(' ');
  if (!taken) return '';
  // End on a sentence rather than mid-clause.
  const lastStop = Math.max(taken.lastIndexOf('. '), taken.lastIndexOf('? '), taken.lastIndexOf('! '));
  return lastStop > taken.length * 0.5 ? taken.slice(0, lastStop + 1) : `${taken}…`;
}

/** Strip a fetched article down to the words the summariser needs. */
function sourceText(markdown: string): string {
  return markdown
    .replace(/^#.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .split(/\s+/)
    .slice(0, SOURCE_WORD_CAP)
    .join(' ')
    .trim();
}

/**
 * Write the summaries, in one call, from the fetched text only.
 *
 * The failure mode of a generated newspaper is a model writing plausible news
 * from memory. Two things prevent it: only stories whose text was actually
 * fetched are sent, and the instruction is to return an empty summary rather
 * than reach for anything not in the passage. A story with no summary still
 * runs — as a headline and a link.
 */
async function summarise(stories: Story[], apiKey: string, model: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const readable = stories.filter((s) => s.body.length > 400);
  if (readable.length === 0) return out;

  const openai = new OpenAI({ apiKey });
  const payload = readable.map((s, i) => ({
    id: String(i),
    headline: s.title,
    outlet: s.source,
    words: s.section === 'lead' ? 220 : s.section === 'front' ? 110 : 80,
    text: sourceText(s.body),
  }));

  const res = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'You are the copy desk of a daily paper. You write news summaries from wire copy.',
          '',
          'Absolute rules:',
          '- Use ONLY the supplied text for each story. Never add background, context, figures, names or consequences that are not in that text.',
          '- If the supplied text does not actually report the story (it is a stub, a nav page, or unrelated), return an empty string for that story. An empty summary is always better than a guess.',
          '- No opinion, no editorialising, no speculation about what happens next.',
          '- Past tense, plain sentences, active voice. No headlines, no bullet points, no markdown.',
          '- Do not begin with "The article" or "This story". Begin with the news.',
          '',
          'Return JSON: {"summaries":[{"id":"0","text":"..."}]}. Respect each story\'s target word count within about 20%.',
        ].join('\n'),
      },
      { role: 'user', content: JSON.stringify({ stories: payload }) },
    ],
  });

  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}');
    for (const entry of parsed.summaries ?? []) {
      const story = readable[Number(entry.id)];
      const text = String(entry.text ?? '').trim();
      if (story && text) out.set(story.id, text);
    }
  } catch {
    // A malformed reply means no summaries, not a failed edition.
  }
  return out;
}

/** A dateline the way a paper prints it. */
function dateline(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Roughly how long a piece takes to read, at a newspaper's pace. */
const minutesToRead = (text: string) =>
  Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 220));

/** The edition number: the day of the year, so it advances once a day. */
function editionNumber(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86_400_000);
}

export interface EditionStory {
  id: string;
  headline: string;
  /** The italic line under the headline. */
  standfirst: string;
  paragraphs: string[];
  source: string;
  author: string | null;
  url: string;
  image: string | null;
  minutes: number;
  /** Where the words came from — printed under each story, so the reader knows. */
  provenance: 'summary' | 'extract' | 'feed' | 'none';
  note?: string;
}

/** Turn a fetched story into something the paper can set. */
function toStory(s: Story, words: number): EditionStory {
  let text = '';
  let provenance: EditionStory['provenance'] = 'none';
  if (s.summary) { text = s.summary; provenance = 'summary'; }
  else if (s.body) { text = openingExtract(s.body, words); provenance = 'extract'; }
  else if (s.content) { text = s.content; provenance = 'feed'; }

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  // The standfirst is the story's first sentence; the body is the rest. A deck
  // that repeats the opening paragraph reads as a stutter.
  const standfirst = sentences.length > 1 ? sentences[0] : '';
  const rest = sentences.length > 1 ? sentences.slice(1) : sentences;

  // Group the remaining sentences into paragraphs of two or three.
  const paragraphs: string[] = [];
  for (let i = 0; i < rest.length; i += 3) paragraphs.push(rest.slice(i, i + 3).join(' '));

  return {
    id: s.id,
    headline: s.title,
    standfirst,
    paragraphs: paragraphs.filter(Boolean),
    source: s.source,
    author: s.author && s.author !== s.source ? s.author : null,
    url: s.url,
    image: null,
    minutes: minutesToRead(text || s.title),
    provenance,
    note: provenance === 'none' ? s.unread : undefined,
  };
}

/** The markdown fallback, so an edition is still readable as plain text. */
function compose(lead: EditionStory, sections: { title: string; stories: EditionStory[] }[],
                 briefs: EditionStory[], now: Date, note: string): string {
  const out: string[] = [];
  out.push(`# The Braindot Edition`);
  out.push(`*${dateline(now)} · ${note}*`);

  const write = (s: EditionStory, level: number) => {
    out.push(`${'#'.repeat(level)} ${s.headline}`);
    out.push(`*${s.author ? `${s.source} · ${s.author}` : s.source}*`);
    if (s.standfirst) out.push(s.standfirst);
    for (const p of s.paragraphs) out.push(p);
    out.push(`[Read it at ${s.source}](${s.url})`);
  };

  write(lead, 2);
  for (const section of sections) {
    out.push('---');
    out.push(`# ${section.title}`);
    for (const s of section.stories) write(s, 2);
  }
  if (briefs.length) {
    out.push('---');
    out.push('# In brief');
    for (const b of briefs) out.push(`**${b.headline}** — ${b.standfirst || ''} [${b.source}](${b.url})`);
  }
  return out.join('\n\n');
}

/** A cover for the shelf: the masthead and the date, drawn rather than fetched. */
function cover(now: Date, leadHeadline: string): string {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c));
  const words = esc(leadHeadline).split(/\s+/).slice(0, 12);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 20) { lines.push(line.trim()); line = w; }
    else line = `${line} ${w}`;
  }
  if (line.trim()) lines.push(line.trim());

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
<rect width="400" height="600" fill="#f2ede1"/>
<rect x="0" y="0" width="400" height="96" fill="#1b1917"/>
<text x="200" y="46" font-family="Georgia,serif" font-size="30" fill="#f2ede1" text-anchor="middle" letter-spacing="1">The Braindot</text>
<text x="200" y="76" font-family="Georgia,serif" font-size="21" fill="#f2ede1" text-anchor="middle" letter-spacing="6">EDITION</text>
<text x="200" y="132" font-family="Georgia,serif" font-size="13" fill="#5b554b" text-anchor="middle">${esc(dateline(now))}</text>
<line x1="34" y1="152" x2="366" y2="152" stroke="#c4bdaf" stroke-width="1"/>
${lines.slice(0, 5).map((l, i) =>
  `<text x="34" y="${200 + i * 34}" font-family="Georgia,serif" font-size="26" fill="#1e1b16">${l}</text>`).join('\n')}
<line x1="34" y1="${210 + Math.min(lines.length, 5) * 34}" x2="366" y2="${210 + Math.min(lines.length, 5) * 34}" stroke="#c4bdaf"/>
${[0, 1, 2].map((c) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((r) =>
  `<rect x="${34 + c * 112}" y="${236 + Math.min(lines.length, 5) * 34 + r * 13}" width="${r === 8 ? 62 : 100}" height="4" fill="#d6cfc0"/>`).join('')).join('')}
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function POST(req: NextRequest) {
  // The most expensive thing the app can be asked to do — a dozen page fetches
  // and a summarising call each — so the allowance is counted in editions per
  // day rather than calls per hour.
  const allowed = await guard(req, 'edition', EDITION_QUOTA);
  if (!allowed.ok) return allowed.response;

  let sections: string[] = ['world', 'business', 'tech', 'science'];
  try {
    const body = await req.json();
    if (Array.isArray(body?.sections) && body.sections.length) sections = body.sections;
  } catch { /* defaults are fine */ }

  const now = new Date();

  // 1. Gather the day's candidates, keeping which desk each came from.
  const batches = await Promise.all(sections.map(async (section) => {
    const items = await collectNews(section).catch(() => [] as FeedItem[]);
    return items.map((i) => ({ ...i, section, body: '' } as Story));
  }));

  const seen = new Set<string>();
  const candidates = rank(batches.flat()).filter((s) => {
    const key = s.url.replace(/[?#].*$/, '');
    if (seen.has(key) || !s.title) return false;
    seen.add(key);
    return true;
  });

  if (candidates.length === 0) {
    return NextResponse.json({ error: 'No stories came back from any source just now.' }, { status: 200 });
  }

  // 2. Fill each section's quota before anything competes for the leftovers,
  //    so technology cannot be crowded out by a busy day on the world wire.
  const picked: Story[] = [];
  const take = (s: Story) => { picked.push(s); };
  for (const section of SECTIONS) {
    const pool = candidates.filter((c) => section.from.includes(c.section) && !picked.includes(c));
    spread(pool, section.min).forEach(take);
  }
  for (const s of spread(candidates.filter((c) => !picked.includes(c)), PLAN.read - picked.length)) take(s);

  // The lead is world news when there is any: a link aggregator's top post is
  // not the front page of a paper about the world, however fresh it is.
  const leadIdx = picked.findIndex((s) => s.section === 'world');
  if (leadIdx > 0) picked.unshift(...picked.splice(leadIdx, 1));

  const pickedIds = new Set(picked.map((s) => s.id));
  const briefRaw = candidates.filter((s) => !pickedIds.has(s.id)).slice(0, PLAN.briefs);

  // 3. Read the chosen stories properly.
  const read = await Promise.all(picked.map(async (s) => {
    const article = await readArticle(s.url);
    if (article.ok) {
      return { ...s, body: article.content, title: article.title || s.title, image: article.leadImage };
    }
    return { ...s, body: '', unread: article.error };
  }));

  // 4. Summarise, from the fetched text only.
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  let note: string;
  let summaries = new Map<string, string>();

  if (!apiKey || apiKey === 'mock') {
    note = 'opening paragraphs as published — no summariser configured';
  } else {
    try {
      const marked = read.map((s, i) => ({ ...s, section: i === 0 ? 'lead' : i < 3 ? 'front' : 'world' }));
      summaries = await summarise(marked, apiKey, model);
      note = `summarised by ${model} from the linked articles`;
    } catch {
      note = 'opening paragraphs as published — the summariser did not answer';
    }
  }

  // 5. Set the paper.
  const built = read.map((s, i) => {
    const story = toStory({ ...s, summary: summaries.get(s.id) }, i === 0 ? 200 : 110);
    return { ...story, image: (s as Story & { image?: string | null }).image ?? null, desk: s.section };
  });
  const [lead, ...others] = built;

  const laidOut = SECTIONS
    .map((section) => ({
      title: section.title,
      stories: others.filter((s) => section.from.includes(s.desk)),
    }))
    .filter((s) => s.stories.length > 0);

  // Anything whose desk has no section still runs, rather than vanishing.
  const placed = new Set(laidOut.flatMap((s) => s.stories.map((x) => x.id)));
  const orphans = others.filter((s) => !placed.has(s.id));
  if (orphans.length) laidOut.push({ title: 'Also today', stories: orphans });

  const briefs = briefRaw.map((s) => toStory(s, 40));
  const sources = [...new Set(built.map((s) => s.source))];
  const totalMinutes = built.reduce((n, s) => n + s.minutes, 0) + Math.ceil(briefs.length / 3);

  const edition = {
    number: editionNumber(now),
    date: now.toISOString(),
    dateline: dateline(now),
    builtAt: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    sources,
    minutes: totalMinutes,
    storyCount: built.length + briefs.length,
    note,
    lead,
    sections: laidOut,
    briefs,
  };

  return NextResponse.json({
    title: `The Braindot Edition — ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    date: now.toISOString(),
    coverUrl: cover(now, lead?.headline ?? 'Today'),
    excerpt: built.slice(0, 3).map((s) => s.headline).join(' · '),
    // The item carries the structure, with the markdown kept beneath it so an
    // edition is still plain text if anything cannot read the paper view.
    content: `${EDITION_MARKER}\n${JSON.stringify(edition)}\n${EDITION_TEXT_MARKER}\n${compose(lead, laidOut, briefs, now, note)}`,
    edition,
    stories: edition.storyCount,
    grounded: built.filter((s) => s.provenance === 'summary').length,
    note,
  });
}