import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { collectNews, type FeedItem } from '../news/route';
import { readArticle } from '@/utils/readArticle';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** How many stories each page of the paper carries. */
const PLAN = {
  front: 3,     // one lead plus two seconds
  world: 5,
  briefs: 6,
};
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

/** Compose the edition as markdown, in reading order. */
function compose(stories: Story[], briefs: Story[], now: Date, note: string): string {
  const [lead, ...seconds] = stories;
  const out: string[] = [];

  // The masthead opens the front page; it does not get a page of its own. The
  // reader splits pages on a horizontal rule, so a rule here would have left
  // page one holding nothing but the title.
  out.push(`# The Braindot Edition`);
  out.push(`*${dateline(now)} · assembled ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · ${note}*`);

  const story = (s: Story, level: number, words: number) => {
    out.push(`${'#'.repeat(level)} ${s.title}`);
    const credit = s.author && s.author !== s.source ? `${s.source} · ${s.author}` : s.source;
    out.push(`*${credit}*`);

    // In order of what we can honestly print: a summary written from the text
    // we fetched, the publisher's own opening, the feed's one-line
    // description, and — only if all three are missing — why we have nothing.
    if (s.summary) {
      out.push(s.summary);
    } else if (s.body) {
      out.push(openingExtract(s.body, words));
      out.push(`*Opening paragraphs, as published.*`);
    } else if (s.content) {
      out.push(s.content);
    } else {
      out.push(`*This story could not be read: ${s.unread ?? 'the page did not respond'}.*`);
    }
    out.push(`[Read it at ${s.source}](${s.url})`);
  };

  if (lead) story(lead, 2, 220);
  for (const s of seconds) story(s, 2, 130);

  if (briefs.length) {
    out.push('---');
    // A section head at h1 so it names its own page in the contents.
    out.push('# In brief');
    for (const b of briefs) {
      const line = b.summary || b.content || (b.body ? openingExtract(b.body, 40) : '');
      out.push(`**${b.title}** — ${line ? `${line} ` : ''}[${b.source}](${b.url})`);
      if (b.unread && !line) out.push(`*Not read in full: ${b.unread}*`);
    }
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
  let sections: string[] = ['world', 'business', 'science', 'tech'];
  try {
    const body = await req.json();
    if (Array.isArray(body?.sections) && body.sections.length) sections = body.sections;
  } catch { /* defaults are fine */ }

  const now = new Date();

  // 1. Gather the day's candidates.
  const batches = await Promise.all(sections.map(async (section) => {
    const items = await collectNews(section).catch(() => [] as FeedItem[]);
    return items.map((i) => ({ ...i, section, body: '' } as Story));
  }));

  const seen = new Set<string>();
  const candidates = rank(batches.flat()).filter((s) => {
    const key = s.url.replace(/[?#].*$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (candidates.length === 0) {
    return NextResponse.json({ error: 'No stories came back from any source just now.' }, { status: 200 });
  }

  // 2. Read the top stories properly. Everything else runs as a brief, from
  //    the headline and the feed's own one-line description.
  // The lead is world news when there is any. A link aggregator's top post is
  // not the front page of a paper about the world, however fresh it is.
  const chosen = spread(candidates, PLAN.front + PLAN.world);
  const leadIdx = chosen.findIndex((s) => s.section === 'world');
  if (leadIdx > 0) chosen.unshift(...chosen.splice(leadIdx, 1));

  const toRead = chosen;
  const readIds = new Set(toRead.map((s) => s.id));
  const rest = candidates.filter((s) => !readIds.has(s.id)).slice(0, PLAN.briefs);

  const read = await Promise.all(toRead.map(async (s) => {
    const article = await readArticle(s.url);
    if (article.ok) return { ...s, body: article.content, title: article.title || s.title };
    return { ...s, body: '', unread: article.error };
  }));

  // 3. Summarise, from the fetched text only.
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  let note: string;
  let summaries = new Map<string, string>();

  if (!apiKey || apiKey === 'mock') {
    note = 'headlines only — no summariser configured';
  } else {
    try {
      const marked = read.map((s, i) => ({ ...s, section: i === 0 ? 'lead' : i < PLAN.front ? 'front' : 'world' }));
      summaries = await summarise(marked, apiKey, model);
      note = `summarised by ${model} from the linked articles`;
    } catch {
      note = 'headlines only — the summariser did not answer';
    }
  }

  const withSummaries = read.map((s) => ({ ...s, summary: summaries.get(s.id) }));
  const grounded = withSummaries.filter((s) => s.summary).length;

  const content = compose(withSummaries, rest, now, note);
  const leadHeadline = withSummaries[0]?.title ?? 'Today';

  return NextResponse.json({
    title: `The Braindot Edition — ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    date: now.toISOString(),
    coverUrl: cover(now, leadHeadline),
    excerpt: withSummaries.slice(0, 3).map((s) => s.title).join(' · '),
    content,
    stories: withSummaries.length + rest.length,
    grounded,
    note,
  });
}
