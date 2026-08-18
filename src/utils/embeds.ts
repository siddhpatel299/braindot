// Embed block utilities — parse and serialize embed blocks inside note body.
// Embeds are stored as fenced code blocks with a special language tag:
//   ```mindmap
//   {json}
//   ```
//   ```kanban
//   {json}
//   ```
//   ```todo
//   {json}
//   ```

import { EmbedBlock, MindMapBlock, KanbanEmbedBlock, TodoEmbedBlock, MindMapNode, Task } from '@/types';

export function generateEmbedId(): string {
  return 'emb_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function generateNodeId(): string {
  return 'nd_' + Math.random().toString(36).slice(2, 8);
}

// Serialize an embed block to markdown fenced code
export function serializeEmbed(block: EmbedBlock): string {
  const lang = block.type;
  const json = JSON.stringify(block);
  return '```' + lang + '\n' + json + '\n```';
}

// Create default embed blocks
export function createMindMapBlock(centerLabel: string = 'Central idea'): MindMapBlock {
  const centerId = generateNodeId();
  const nodes: MindMapNode[] = [
    { id: centerId, label: centerLabel, x: 0, y: 0, parentId: null },
    { id: generateNodeId(), label: 'Branch 1', x: -160, y: -60, parentId: centerId },
    { id: generateNodeId(), label: 'Branch 2', x: 160, y: -60, parentId: centerId },
    { id: generateNodeId(), label: 'Branch 3', x: -120, y: 80, parentId: centerId },
    { id: generateNodeId(), label: 'Branch 4', x: 120, y: 80, parentId: centerId },
  ];
  return {
    id: generateEmbedId(),
    type: 'mindmap',
    nodes,
    height: 280,
  };
}

export function createKanbanEmbedBlock(cards?: Task[]): KanbanEmbedBlock {
  return {
    id: generateEmbedId(),
    type: 'kanban',
    cards: cards || [],
  };
}

export function createTodoEmbedBlock(): TodoEmbedBlock {
  return {
    id: generateEmbedId(),
    type: 'todo',
    items: [
      { id: 'ti_' + Math.random().toString(36).slice(2, 8), text: 'First task', done: false, priority: 'medium', dueGroup: 'today' },
      { id: 'ti_' + Math.random().toString(36).slice(2, 8), text: 'Second task', done: false, priority: 'low', dueGroup: 'this-week' },
    ],
  };
}

// Parse the note body and extract embed blocks along with text segments.
// Returns an array of segments: either { type: 'text', content: string }
// or { type: 'embed', block: EmbedBlock, startLine: number, endLine: number }
export interface BodySegment {
  type: 'text' | 'embed';
  content?: string;        // for text segments
  block?: EmbedBlock;      // for embed segments
  startOffset?: number;    // char offset in the original body
  endOffset?: number;
}

export function parseBodySegments(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  const lines = body.split('\n');
  let i = 0;
  let textBuffer: string[] = [];
  let textStart = 0;
  let currentOffset = 0;

  const flushText = () => {
    // Always push text segments, even if empty — this ensures the user can
    // write in the text area after an embed block.
    const text = textBuffer.join('\n');
    segments.push({
      type: 'text',
      content: text,
      startOffset: textStart,
      endOffset: textStart + text.length,
    });
    textBuffer = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    // Check for embed fence: ```mindmap, ```kanban, ```todo
    const embedMatch = line.match(/^```(mindmap|kanban|todo)\s*$/);
    if (embedMatch) {
      flushText();
      const embedType = embedMatch[1] as 'mindmap' | 'kanban' | 'todo';
      const startOffset = currentOffset;
      i++;
      // Collect JSON until closing ```
      const jsonLines: string[] = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        jsonLines.push(lines[i]);
        currentOffset += lines[i].length + 1; // +1 for \n
        i++;
      }
      const endOffset = i < lines.length ? currentOffset + 3 : body.length; // +3 for closing ```
      if (i < lines.length) {
        currentOffset += 3 + 1; // ``` + \n
        i++; // skip closing ```
      }
      try {
        const json = jsonLines.join('\n');
        const block = JSON.parse(json) as EmbedBlock;
        segments.push({
          type: 'embed',
          block,
          startOffset,
          endOffset,
        });
      } catch {
        // If JSON is invalid, treat as text
        segments.push({
          type: 'text',
          content: '```' + embedType + '\n' + jsonLines.join('\n') + '\n```',
          startOffset,
          endOffset,
        });
      }
      textStart = currentOffset;
    } else {
      textBuffer.push(line);
      currentOffset += line.length + 1; // +1 for \n
      i++;
    }
  }
  flushText();
  return segments;
}

// Replace an embed block in the body with a new version
export function replaceEmbedInBody(body: string, blockId: string, newBlock: EmbedBlock): string {
  const segments = parseBodySegments(body);
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg.type === 'text') {
      parts.push(seg.content || '');
    } else if (seg.type === 'embed') {
      if (seg.block?.id === blockId) {
        parts.push(serializeEmbed(newBlock));
      } else {
        parts.push(serializeEmbed(seg.block!));
      }
    }
  }
  return parts.join('\n');
}

// Remove an embed block from the body by ID
export function removeEmbedFromBody(body: string, blockId: string): string {
  const segments = parseBodySegments(body);
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg.type === 'text') {
      parts.push(seg.content || '');
    } else if (seg.type === 'embed') {
      if (seg.block?.id !== blockId) {
        parts.push(serializeEmbed(seg.block!));
      }
    }
  }
  return parts.join('\n');
}
