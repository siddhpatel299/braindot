// Semantic search embedding utilities
// Uses Transformers.js (loaded from CDN) to run all-MiniLM-L6-v2 locally in browser
// Vectors are 384-dimensional, stored in IndexedDB via idb-keyval

import { get, set, del, keys, createStore } from 'idb-keyval';

// Separate IndexedDB store for embeddings (don't mix with app state)
const embeddingStore = createStore('second-brain-embeddings', 'embeddings');

export interface NoteEmbedding {
  noteId: string;
  vector: number[];
  embeddedAt: string;
  textHash: string;
}

// Lazy-loaded model pipeline — only initialize when first needed
let extractorPromise: Promise<any> | null = null;

/**
 * Load the Transformers.js library from CDN (returns the global).
 * This avoids bundling the full library — it's loaded as a script tag.
 */
function loadTransformersScript(): Promise<any> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).TransformersPipeline) {
      resolve((window as any).TransformersPipeline);
      return;
    }
    // Check if script already exists
    const existing = document.getElementById('transformers-cdn');
    if (existing) {
      existing.addEventListener('load', () => {
        resolve((window as any).pipeline || (window as any).Transformers);
      });
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'transformers-cdn';
    script.type = 'module';
    script.src = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
    script.onload = () => {
      // The library exposes itself as a global with `pipeline` function
      const lib = (window as any).pipeline || (window as any).Transformers;
      if (lib) {
        resolve(lib);
      } else {
        // Try to find it on the global object
        const globals = (window as any);
        const pipelineFn = globals.pipeline || (globals.Transformers && globals.Transformers.pipeline);
        if (pipelineFn) resolve(pipelineFn);
        else reject(new Error('Transformers.js loaded but pipeline function not found'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Transformers.js from CDN'));
    document.head.appendChild(script);
  });
}

/**
 * Load the Transformers.js pipeline (all-MiniLM-L6-v2).
 * Downloads ~23MB model on first call, cached by browser thereafter.
 */
export async function getEmbeddingPipeline(): Promise<any> {
  if (extractorPromise) return extractorPromise;

  extractorPromise = (async () => {
    const pipeline = await loadTransformersScript();
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    return extractor;
  })();

  return extractorPromise;
}

/**
 * Check if the model is already cached (fast — doesn't actually load it)
 */
export function isModelLoading(): boolean {
  return extractorPromise !== null;
}

/**
 * Embed text into a 384-dimensional vector.
 * Uses mean pooling and L2 normalization.
 */
export async function embedText(text: string): Promise<number[]> {
  const extractor = await getEmbeddingPipeline();
  // Truncate to ~512 tokens (roughly 2000 chars) to keep embedding fast
  const truncated = text.slice(0, 2000);
  const output = await extractor(truncated, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Compute cosine similarity between two vectors.
 * Since vectors are L2-normalized, this is just the dot product,
 * but we compute it properly to handle any edge case.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  // Already normalized, but be safe:
  let magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

/**
 * Simple hash function for detecting note content changes.
 * Returns a hash string that changes when the text changes.
 */
export function textHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  // Include length for extra sensitivity
  return `${hash.toString(36)}_${text.length}`;
}

// ============================================================
// IndexedDB storage for embeddings
// ============================================================

export async function getEmbedding(noteId: string): Promise<NoteEmbedding | undefined> {
  return await get(`embedding:${noteId}`, embeddingStore);
}

export async function setEmbedding(noteId: string, vector: number[], text: string): Promise<void> {
  const emb: NoteEmbedding = {
    noteId,
    vector,
    embeddedAt: new Date().toISOString(),
    textHash: textHash(text),
  };
  await set(`embedding:${noteId}`, emb, embeddingStore);
}

export async function deleteEmbedding(noteId: string): Promise<void> {
  await del(`embedding:${noteId}`, embeddingStore);
}

export async function getAllEmbeddingKeys(): Promise<string[]> {
  const ks = await keys(embeddingStore);
  return ks.map((k) => String(k));
}

export async function getAllEmbeddings(): Promise<NoteEmbedding[]> {
  const ks = await keys(embeddingStore);
  const results: NoteEmbedding[] = [];
  for (const k of ks) {
    const emb = await get(k, embeddingStore);
    if (emb) results.push(emb as NoteEmbedding);
  }
  return results;
}

/**
 * Get the text to embed for a note.
 * Title + subtitle + body, truncated.
 */
export function getNoteEmbeddingText(note: { title: string; subtitle?: string; body: string }): string {
  const parts = [note.title, note.subtitle || '', note.body].filter(Boolean);
  return parts.join(' ').trim();
}
