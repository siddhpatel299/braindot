'use client';

import { KanbanEmbedBlock, Task } from '@/types';
import { KanbanSquare, X, ArrowRight } from 'lucide-react';

interface KanbanEmbedProps {
  block: KanbanEmbedBlock;
  onRemove: () => void;
  onOpenFullBoard: () => void;
}

/* The task model's states. `in-progress` became `doing` when the board and
   the todo rail were merged into one collection. */
const STATE_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  doing: 'Doing',
  review: 'Review',
  done: 'Done',
};

export function KanbanEmbed({ block, onRemove, onOpenFullBoard }: KanbanEmbedProps) {
  // Group cards by status, max 3 columns
  const statuses = ['backlog', 'doing', 'review', 'done'] as const;
  const grouped: Record<string, Task[]> = {};
  for (const s of statuses) grouped[s] = [];
  for (const c of block.cards) {
    if (grouped[c.state]) grouped[c.state].push(c);
  }
  const visibleStatuses = statuses.filter((s) => grouped[s].length > 0).slice(0, 3);

  return (
    <div style={{
      border: '1px solid var(--bd2)',
      borderRadius: 8,
      overflow: 'hidden',
      margin: '16px 0',
      background: 'var(--bg)',
    }}>
      {/* Header */}
      <div style={{
        height: 32,
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <KanbanSquare size={12} color="var(--t3)" />
          <span style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--t3)',
            fontWeight: 600,
          }}>
            kanban preview — embedded
          </span>
        </div>
        <button
          onClick={onRemove}
          title="Remove"
          style={{
            width: 22, height: 22, borderRadius: 3,
            background: 'transparent', border: 'none',
            color: 'var(--t3)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Condensed columns (max 3, title + tag only, read-only) */}
      <div style={{
        display: 'flex',
        gap: 8,
        padding: '10px 12px',
        overflowX: 'auto',
      }}>
        {visibleStatuses.map((status) => (
          <div key={status} style={{
            flex: 1,
            minWidth: 140,
            background: 'var(--bg1)',
            border: '1px solid var(--bd)',
            borderRadius: 5,
            padding: '8px 10px',
          }}>
            <div style={{
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--t3)',
              fontWeight: 600,
              marginBottom: 8,
            }}>
              {STATE_LABELS[status]}
            </div>
            {grouped[status].slice(0, 4).map((card) => {
              return (
                <div key={card.id} style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--bd)',
                  borderRadius: 4,
                  padding: '6px 8px',
                  marginBottom: 5,
                }}>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--t1)',
                    lineHeight: 1.3,
                  }}>
                    {card.title}
                  </div>
                </div>
              );
            })}
            {grouped[status].length === 0 && (
              <div style={{ fontSize: 10, color: 'var(--t3)', fontStyle: 'italic' }}>empty</div>
            )}
          </div>
        ))}
      </div>

      {/* Footer link */}
      <div style={{
        borderTop: '1px solid var(--bd)',
        padding: '8px 12px',
        textAlign: 'right',
      }}>
        <button
          onClick={onOpenFullBoard}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--acc)',
            fontSize: 11,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontWeight: 600,
          }}
        >
          open full board
          <ArrowRight size={11} />
        </button>
      </div>
    </div>
  );
}
