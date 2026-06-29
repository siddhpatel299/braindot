import { Note, NoteCollection } from '@/types';

// Helper to build consistent timestamps (June 2026, recent)
const ts = (daysAgo: number, hoursAgo: number = 0): string => {
  const d = new Date('2026-06-29T10:00:00Z');
  d.setDate(d.getDate() - daysAgo);
  d.setHours(d.getHours() - hoursAgo);
  return d.toISOString();
};

// Word count helper
const wc = (body: string): number => body.split(/\s+/).filter(Boolean).length;

// IDs are stable so wiki-links can reference them
export const SEED_NOTE_IDS = {
  zettelkasten:           'nt_zettelkasten_method',
  para:                   'nt_para_method',
  decisionFatigue:        'nt_decision_fatigue',
  spacedRepetition:       'nt_spaced_repetition',
  progressiveSummarisation:'nt_progressive_summarisation',
  expertiseInvisibility:  'nt_expertise_invisibility',
} as const;

interface SeedSpec {
  id: string;
  filename: string;
  title: string;
  subtitle: string;
  tags: string[];
  body: string;
  status: 'draft' | 'evergreen';
  collection: NoteCollection;
  createdDaysAgo: number;
  updatedHoursAgo: number;
}

const SPECS: SeedSpec[] = [
  {
    id: SEED_NOTE_IDS.zettelkasten,
    filename: 'zettelkasten-method.md',
    title: 'Zettelkasten Method',
    subtitle: 'A note-taking system that thinks with you, not just for you.',
    tags: ['strategy', 'learning'],
    body: `The Zettelkasten method is a personal knowledge system invented by German sociologist Niklas Luhmann, who used it to write over 70 books and 400 articles in his lifetime. The core insight is deceptively simple: each note should be atomic, self-contained, and densely linked to other notes. The system rewards thinking in writing rather than thinking about writing.

## Atomic Notes

Each note should capture a single idea. If you find yourself writing two ideas, split them. An atomic note is easy to link, easy to revisit, and easy to recombine with other notes when a new pattern emerges. The discipline of atomization forces clarity — vague ideas collapse under their own weight when you try to give them a standalone home.

The note's title is not its filename. The title is the **claim** the note is making. "Zettelkasten Method" is a label; "Atomic notes make ideas re-combinable" is a claim. The best notes have claim-shaped titles.

## Linking Over Categorizing

Folders rot. Categories ossify. Links, on the other hand, accumulate value: every new connection strengthens the network. Luhmann's archive had roughly 90,000 notes and over 200,000 links between them — the links were the real substrate of his thinking.

> [!callout]
> The Zettelkasten is not a filing cabinet. It is a thinking partner. You don't retrieve from it; you converse with it.

When I write a note about [[decision-fatigue]], I link it here because the link itself is a thought: "decision fatigue constrains how atomic a note can be in practice — when you are tired, you reach for categories instead of links."

## Permanent vs Fleeting

Three tiers: fleeting notes (capture, review within 48 hours), literature notes (what someone else said, with citation), and permanent notes (your own claim, atomic, linked). Most people get stuck because they treat fleeting notes as permanent. The cost of permanence is high — only ideas that survive a re-read deserve it.

- Fleeting: cheap, abundant, expected to be discarded
- Literature: faithful to source, mostly summary
- Permanent: your synthesis, dense with links to [[spaced-repetition]] and [[para-method]]

The [[progressive-summarisation]] technique is a complementary way to surface what matters inside literature notes before they are promoted.`,
    status: 'evergreen',
    collection: 'pinned',
    createdDaysAgo: 47,
    updatedHoursAgo: 26,
  },
  {
    id: SEED_NOTE_IDS.para,
    filename: 'para-method.md',
    title: 'PARA Method',
    subtitle: 'Organize by actionability, not by topic. Folders that decay into usefulness.',
    tags: ['learning'],
    body: `Tiago Forte's PARA method organizes information across four folders: **Projects** (active, with a deadline), **Areas** (ongoing responsibility, no deadline), **Resources** (topical interest, no commitment), and **Archives** (inactive items from the other three). The principle is actionability — sort by how soon you will act on something, not by what it is about.

## The Actionability Hierarchy

Projects sit at the top because they have a clear next action and a finish line. Areas are next: you will return to them, but not on a schedule. Resources have no commitment — you keep them because they might be useful. Archives are the past.

The genius of this ordering is that it surfaces what to look at right now. When you sit down to work, you open Projects. When you have time to maintain something, you open Areas. When you are curious, you browse Resources. The structure tells you what to do without a separate to-do list.

## Why It Works (and Where It Breaks)

PARA works because it forces a single sort dimension. Topic-based folders fail because a note can be about many topics — but it can only be at one level of actionability. This constraint is what makes the system usable at scale.

> [!callout]
> A note's place in PARA is not permanent. As projects finish, they flow into Archives. As resources become relevant, they are promoted. The system is a slow waterfall.

The breakdown happens when people treat the four folders as categories rather than phases. A note is not "a Resource" forever; it is "a Resource right now." This is the same misunderstanding that sinks the [[zettelkasten-method]] when people treat atomic notes as permanent claims rather than provisional thinking.

## PARA vs Zettelkasten

PARA organizes where things live. Zettelkasten organizes how things connect. They are not competitors — they operate at different layers. Use PARA for project files, drafts, and reference material. Use a wiki of atomic notes (linked with [[decision-fatigue]]-aware restraint) for your own thinking. The two systems share the same insight: structure should reflect attention, not subject matter.

When I find myself reaching for a new folder, I check whether I am actually creating structure or just hiding decision fatigue. Usually the answer is the latter, and [[progressive-summarisation]] is the better tool.`,
    status: 'draft',
    collection: 'learning',
    createdDaysAgo: 32,
    updatedHoursAgo: 5,
  },
  {
    id: SEED_NOTE_IDS.decisionFatigue,
    filename: 'decision-fatigue.md',
    title: 'Decision Fatigue',
    subtitle: 'Why every choice costs you, and why structure is the cure.',
    tags: ['strategy'],
    body: `Decision fatigue is the empirical observation that the human brain, like a muscle, loses decision-making quality after a sequence of choices. Each decision — even small ones like what to wear or what to eat — draws down a finite pool of attention. By evening, the pool is empty, and we default to whichever option requires the least effort.

## The Hidden Cost of Choice

Researchers have found this effect everywhere: judges grant parole less often as the day wears on, shoppers buy more impulse items after a long deliberation, and people are more likely to lie or cheat when their self-regulation is depleted. The effect is not a moral failing; it is a biological constraint.

This is why [[para-method]] works: it removes decisions about where things go. It is why Steve Jobs wore the same outfit every day. It is why the [[zettelkasten-method]] resists folder hierarchies — every folder is a future decision about where to file something, and decisions are expensive.

## Structure as Energy Conservation

> [!callout]
> The point of a system is not to be correct. The point is to make the next decision obvious, so you can spend your energy on the work itself.

When a system requires you to choose between two equally valid options every time you use it, the system is broken — not because the choice is hard, but because the choice is frequent. Good systems have defaults that you follow without thinking, and exceptions that you notice only because they stand out.

## Implications for Note-Taking

Every note you write carries an implicit question: where does this go? If the answer is always "a new folder," you have built a decision factory. If the answer is "an atomic note linked to two existing ones," you have built a thinking tool.

- Default to a single inbox for capture
- Default to atomic notes for permanent storage
- Default to links instead of categories
- Reserve folders for genuinely different modes of work

The [[spaced-repetition]] insight — that the brain consolidates memories over time — has a parallel here: the brain also consolidates decisions. A choice you make once is cheap. A choice you make a thousand times is a system, and systems deserve more design attention than they get.`,
    status: 'evergreen',
    collection: 'strategy',
    createdDaysAgo: 28,
    updatedHoursAgo: 11,
  },
  {
    id: SEED_NOTE_IDS.spacedRepetition,
    filename: 'spaced-repetition.md',
    title: 'Spaced Repetition',
    subtitle: 'Memory is not storage. It is prediction, trained on intervals.',
    tags: ['learning', 'research'],
    body: `Spaced repetition is the practice of reviewing information at increasing intervals — one day, then three, then a week, then a month — based on how well you recalled it the last time. The technique exploits the spacing effect, the finding that memory consolidation is stronger when exposure is distributed across time rather than massed into a single session.

## The Forgetting Curve

Ebbinghaus discovered in 1885 that memory decays predictably: steep at first, then flattening. Each review resets the curve but at a slower rate of decay. After enough cycles, the memory approaches permanence. The interval is not arbitrary — it is calibrated to push review just before you would have forgotten.

The surprising finding is that **harder recalls produce stronger memories**. The brain interprets effortful retrieval as a signal that this information matters, and consolidates it more deeply. This is why cramming fails: effortless re-reading tells the brain the information is already secured, when in fact it has not been consolidated at all.

## Implications for a Knowledge System

> [!callout]
> A note you have never revisited is not a memory. It is a hope.

Most note-taking systems optimize for capture and storage, ignoring the third and most important phase: retrieval. A second brain with 10,000 notes you have never re-read is not a second brain; it is a notebook someone else might one day read.

This is why the [[zettelkasten-method]] practice of revisiting and linking old notes is not optional polish — it is the mechanism by which notes become knowledge. It is also why [[progressive-summarisation]] works: each pass of highlighting is a retrieval event, even if you do not consciously realize it.

## How I Apply It

- New notes are reviewed on day 1, day 3, day 7, day 21, day 60
- A note that survives 60 days is promoted to evergreen
- Notes that feel stale on review get a new link to refresh their context
- I link to [[para-method]] notes that are no longer active, so they re-surface during reviews

The [[expertise-invisibility]] problem is the mirror image: experts have automated so much that they can no longer retrieve the steps of their own reasoning. Spaced repetition is one tool for keeping the steps accessible.`,
    status: 'draft',
    collection: 'research',
    createdDaysAgo: 21,
    updatedHoursAgo: 2,
  },
  {
    id: SEED_NOTE_IDS.progressiveSummarisation,
    filename: 'progressive-summarisation.md',
    title: 'Progressive Summarisation',
    subtitle: 'Highlight, then highlight the highlights. Each pass is a new decision.',
    tags: ['reading'],
    body: `Progressive summarisation is Tiago Forte's technique for making notes more useful over time without re-writing them. You read a passage, highlight the best sentences. Later, you highlight the best phrases inside those sentences. Later still, you write a one-sentence summary in your own words. Each pass is small, but each pass is also a retrieval event.

## Why It Works

The technique works because it layers compression. The first pass captures everything. The second pass captures the spine. The third pass captures the claim. By the time you have a one-sentence summary, you have engaged with the source three times — which, per [[spaced-repetition]], is exactly what your memory needs.

Critically, each pass happens at a different time. You do not summarize a note the day you write it; you summarize it weeks later, when you have forgotten enough that the act of summarizing is genuinely retrieval rather than recitation. This is why the technique produces durable memory where re-reading does not.

## The Failure Mode

> [!callout]
> Highlighting feels like work. It is not work. It is the illusion of work unless you return to the highlights and decide what matters.

The trap is that highlighting is effortless, and effortless activity does not consolidate memory. The technique only works if each pass is harder than the last — first easy highlighting, then a tighter selection, then a sentence in your own words. If you skip the final step, you have just decorated the source.

## Connection to Other Methods

Progressive summarisation is the reading layer of the [[para-method]] system: it tells you what to do inside a Resource note before it is promoted to a Project. It is also a complement to the [[zettelkasten-method]]: progressive summaries become literature notes, which in turn become atomic permanent notes.

- Pass 1: capture the source verbatim
- Pass 2: bold the spine (within a week)
- Pass 3: highlight the boldest (within a month)
- Pass 4: write the one-sentence claim (only when prompted)

The fourth pass is the one that connects to [[decision-fatigue]]-aware design: do not do it on a schedule, do it when you reach for the note for some other reason. The decision to summarize should be organic, not calendar-driven.`,
    status: 'draft',
    collection: 'reading',
    createdDaysAgo: 18,
    updatedHoursAgo: 49,
  },
  {
    id: SEED_NOTE_IDS.expertiseInvisibility,
    filename: 'expertise-invisibility.md',
    title: 'Expertise Invisibility',
    subtitle: 'The better you are at something, the less you can explain how you do it.',
    tags: ['research'],
    body: `Expertise invisibility is the phenomenon where the most skilled practitioners are the worst at articulating their own method. As a skill becomes automated, the conscious steps that originally composed it fade from access. The expert "just sees" the answer; the intermediate can list the steps they took. This is why interviewing experts often produces useless transcripts — they describe what they think they do, not what they actually do.

## The Cognitive Architecture

When you learn a skill, each step occupies working memory. As you practice, steps chunk together: two steps become one, then three become one, until a complex procedure feels like a single perception. This chunking is the substrate of expertise. It is also why experts cannot teach well by description — the chunks are not available to introspection.

This is captured in the Dreyfus model of skill acquisition: novice, advanced beginner, competent, proficient, expert. The transition from proficient to expert is precisely the transition from rule-following to intuitive response. The expert has lost access to the rules.

## Implications for Knowledge Work

> [!callout]
> The most valuable notes are the ones that capture what you cannot yet say. The second-most valuable are the ones that force you to say it anyway.

If expertise is invisible to the expert, then a personal knowledge system has a paradoxical job: it must capture the steps the expert can no longer see. This is why [[progressive-summarisation]] matters — its fourth pass, the one-sentence claim in your own words, is the act of dragging an automated intuition back into language.

It is also why the [[zettelkasten-method]] practice of writing atomic notes is harder than it looks. The expert's instinct is to write the conclusion; the system demands the reasoning. Each link is a small act of de-automating thought.

## Practical Consequences

- A note that feels obvious is the most important note to write down
- A note you cannot finish is more valuable than one you can — it marks the edge of your articulable knowledge
- Re-reading old notes is the only way to recover lost steps, because the version of you that wrote them had not yet automated the skill
- Pair the [[spaced-repetition]] schedule with a deliberate "explain it like I am a beginner" pass

The [[decision-fatigue]] angle is real too: experts make decisions without noticing them, which is efficient for the expert and confusing for everyone downstream. A second brain is partly a translation layer — it makes expert decisions legible to future, less-expert versions of yourself.`,
    status: 'draft',
    collection: 'research',
    createdDaysAgo: 12,
    updatedHoursAgo: 30,
  },
];

export const SEED_NOTES: Note[] = SPECS.map((s) => {
  const created = ts(s.createdDaysAgo);
  const updated = ts(0, s.updatedHoursAgo);
  return {
    id: s.id,
    filename: s.filename,
    title: s.title,
    subtitle: s.subtitle,
    tags: s.tags,
    body: s.body,
    backlinks: [], // filled in below
    createdAt: created,
    updatedAt: updated,
    wordCount: wc(s.body),
    status: s.status,
    collection: s.collection,
  };
});

// Helper for new note IDs
export function generateNoteId(): string {
  return 'nt_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
