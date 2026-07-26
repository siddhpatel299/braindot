import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ContextNote {
  title: string;
  subtitle?: string;
  tags?: string[];
  body: string;
}

interface AskRequest {
  noteTitle?: string;
  noteBody?: string;
  noteTags?: string[];
  question: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  /** 'note' (default) — answer about the current note; 'vault' — retrieved notes; 'study' — Socratic tutor */
  scope?: 'note' | 'vault' | 'study';
  /** Top-K notes retrieved client-side for vault scope */
  contextNotes?: ContextNote[];
  /** For study scope: the course/topic the learner is working in */
  topic?: string;
}

const STUDY_SYSTEM_PROMPT = `You are an interactive study tutor inside "Second Brain", a note-taking app. The learner is studying a topic and you teach it the way a great human tutor would — this is "study mode", not a lecture.

How to teach:
- Be interactive and Socratic. Explain a focused chunk, then ask the learner a question to check understanding or push them to think. Wait for their answer before dumping the next chunk. Never write a wall of text.
- Adapt to their level from how they answer. If they're lost, slow down and give an analogy; if they're ahead, go deeper.
- Prefer active recall: ask them to predict, recall, or apply before you confirm.
- Keep each turn short — a paragraph or two, then a question. This is a dialogue.

Use visuals when a concept is spatial, sequential, comparative, or time-based. Emit a Mermaid diagram in a fenced code block with the language "mermaid". Choose the right type:
- Process / architecture / decision: \`flowchart TD\`
- Study plan / schedule / deadlines: \`gantt\` (a calendar/timeline) or \`timeline\`
- History / ordered milestones: \`timeline\`
- Concept breakdown / overview: \`mindmap\`
- Interaction / request flow: \`sequenceDiagram\`
Keep diagrams small and labelled. Only add one when it genuinely aids understanding — don't force it.

Formatting:
- Markdown. Short paragraphs, occasional bullet lists, **bold** for key terms.
- When you introduce a term worth keeping, you may reference related notes with [[wiki-link]] syntax.
- End most turns with a single clear question or a small task for the learner.
- Never start with filler like "Certainly" — just teach.`;

const NOTE_SYSTEM_PROMPT = `You are a thoughtful personal knowledge management (PKM) assistant inside a note-taking app called "Second Brain". The user is working on a note and wants your help thinking about it.

Your style:
- Concise but substantive. 2-4 short paragraphs max unless the user explicitly asks for depth.
- Think in writing, don't just summarize. Push the user's thinking forward.
- If the note has a gap, name it. If it has a strong claim, pressure-test it.
- Use [[wiki-link]] syntax when referencing concepts that might exist as other notes.
- Match the user's register: if the note is casual, be casual; if academic, be academic.
- Never use bullet lists unless the user asks. Prefer prose.
- Never start with "Great question" or "Based on the note" — just answer.
- When asked to rewrite, continue, or transform text, return ONLY the resulting text — no preamble, no commentary, no surrounding quotes.`;

const VAULT_SYSTEM_PROMPT = `You are the knowledge assistant inside "Second Brain", a PKM app. You answer questions using excerpts from the user's own note vault, provided below.

Rules:
- Ground your answer in the provided notes. When you draw on a note, cite it inline with its exact title in wiki-link syntax: [[Note Title]].
- If the notes don't contain the answer, say so plainly and answer from general knowledge, clearly separating the two.
- Synthesize across notes — point out connections and contradictions between them.
- Concise but substantive: 2-4 short paragraphs unless asked for depth. Prose over bullet lists.
- Never start with filler like "Based on your notes" — just answer.`;

function buildMessages(body: AskRequest) {
  const { noteTitle, noteBody, noteTags, question, history, scope, contextNotes, topic } = body;
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

  if (scope === 'study') {
    messages.push({ role: 'system', content: STUDY_SYSTEM_PROMPT });
    if (history?.length) {
      for (const h of history) messages.push({ role: h.role, content: h.content });
    }
    const topicLine = topic ? `We are studying: "${topic}".` : '';
    const noteLine = noteBody?.trim()
      ? `\n\nMy current notes on this (for context):\n${noteBody.slice(0, 2000)}`
      : '';
    messages.push({ role: 'user', content: `${topicLine}${noteLine}\n\n${question}`.trim() });
    return messages;
  }

  if (scope === 'vault') {
    messages.push({ role: 'system', content: VAULT_SYSTEM_PROMPT });
    const excerpts = (contextNotes || [])
      .map((n, i) => {
        const tags = n.tags?.length ? ` (tags: ${n.tags.join(', ')})` : '';
        const sub = n.subtitle ? `\n${n.subtitle}` : '';
        return `--- NOTE ${i + 1}: "${n.title}"${tags} ---${sub}\n${n.body}`;
      })
      .join('\n\n');
    if (history?.length) {
      for (const h of history) messages.push({ role: h.role, content: h.content });
    }
    messages.push({
      role: 'user',
      content: `${excerpts ? `Here are the most relevant notes from my vault:\n\n${excerpts}\n\n` : 'My vault has no notes relevant to this question.\n\n'}My question: ${question}`,
    });
  } else {
    messages.push({ role: 'system', content: NOTE_SYSTEM_PROMPT });
    if (history?.length) {
      for (const h of history) messages.push({ role: h.role, content: h.content });
    }
    messages.push({
      role: 'user',
      content: `I'm working on a note titled "${noteTitle}"${noteTags?.length ? ` (tags: ${noteTags.join(', ')})` : ''}.\n\n--- NOTE BODY ---\n${noteBody || '(empty — the user just started this note)'}\n--- END NOTE BODY ---\n\nMy question: ${question}`,
    });
  }
  return messages;
}

// With OPENAI_API_KEY=mock the route streams a canned response so the UI can
// be exercised without a real key. Replace with a real key for real answers.
function mockStream(scope: string | undefined): ReadableStream<Uint8Array> {
  const text =
    scope === 'study'
      ? `Let's start with the big picture. An **Azure certification** like AZ-900 covers cloud concepts, core services, security, and pricing.\n\nHere's a simple prep timeline:\n\n\`\`\`mermaid\ntimeline\n    title AZ-900 Prep Plan\n    Week 1 : Cloud concepts : IaaS vs PaaS vs SaaS\n    Week 2 : Core Azure services : Compute, Storage, Network\n    Week 3 : Security & identity : Practice exam\n\`\`\`\n\nBefore we go on — in your own words, what do you think is the difference between **IaaS** and **SaaS**? (This is a mock reply; set a real OPENAI_API_KEY for a live tutor.)`
      : scope === 'vault'
      ? `This is a mock vault answer — the app is running without a real OpenAI key.\n\nRetrieval worked: the relevant notes from your vault were found and sent along with your question (for example [[Welcome to Second Brain]]). Once you set a real OPENAI_API_KEY in .env.local and restart the dev server, answers will be grounded in those notes.`
      : `This is a mock response — the app is running without a real OpenAI key.\n\nStreaming, the chat UI, and note context are all working end to end. Set OPENAI_API_KEY in .env.local (replacing "mock") and restart the dev server to get real answers.`;
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= text.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(text.slice(i, i + 6)));
      i += 6;
      await new Promise((r) => setTimeout(r, 12));
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not set. Add it to .env.local and restart the server.' },
        { status: 500 },
      );
    }

    const body = (await req.json()) as AskRequest;
    if (!body.question || !body.question.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    if (apiKey === 'mock') {
      return new Response(mockStream(body.scope), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: buildMessages(body),
      temperature: 0.7,
      max_tokens: 1600,
      stream: true,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/ai/ask] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
