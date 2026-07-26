// Client helper for the streaming /api/ai/ask endpoint.
// Errors arrive as JSON with a non-200 status; success is a plain-text
// token stream. onDelta receives the FULL text accumulated so far.

export interface AskPayload {
  noteTitle?: string;
  noteBody?: string;
  noteTags?: string[];
  question: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  scope?: 'note' | 'vault' | 'study';
  contextNotes?: { title: string; subtitle?: string; tags?: string[]; body: string }[];
  topic?: string;
}

export async function streamAsk(
  payload: AskPayload,
  onDelta: (fullText: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch('/api/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (!res.body) {
    throw new Error('No response body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onDelta(full);
  }
  full += decoder.decode();
  if (full) onDelta(full);
  return full;
}
