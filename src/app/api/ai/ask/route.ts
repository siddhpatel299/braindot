import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface AskRequest {
  noteTitle: string;
  noteBody: string;
  noteTags: string[];
  question: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

const SYSTEM_PROMPT = `You are a thoughtful personal knowledge management (PKM) assistant inside a note-taking app called "Second Brain". The user is working on a note and wants your help thinking about it.

Your style:
- Concise but substantive. 2-4 short paragraphs max unless the user explicitly asks for depth.
- Think in writing, don't just summarize. Push the user's thinking forward.
- If the note has a gap, name it. If it has a strong claim, pressure-test it.
- Use [[wiki-link]] syntax when referencing concepts that might exist as other notes.
- Match the user's register: if the note is casual, be casual; if academic, be academic.
- Never use bullet lists unless the user asks. Prefer prose.
- Never start with "Great question" or "Based on the note" — just answer.`;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AskRequest;
    const { noteTitle, noteBody, noteTags, question, history } = body;

    if (!question || !question.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const zai = await ZAI.create();

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `I'm working on a note titled "${noteTitle}"${noteTags.length ? ` (tags: ${noteTags.join(', ')})` : ''}.\n\n--- NOTE BODY ---\n${noteBody || '(empty — the user just started this note)'}\n--- END NOTE BODY ---\n\nMy question: ${question}`,
      },
    ];

    if (history && history.length > 0) {
      for (const h of history) {
        messages.push({ role: h.role, content: h.content });
      }
    }

    const response = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    });

    const answer = response.choices[0]?.message?.content || '(no response)';
    return NextResponse.json({ response: answer });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/ai/ask] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
