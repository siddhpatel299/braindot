'use client';

import { KanbanEmbedBlock, KanbanCardItem } from '@/types';
import { KanbanSquare, X, ArrowRight } from 'lucide-react';

interface KanbanEmbedProps {
  block: KanbanEmbedBlock;
  onRemove: () => void;
  onOpenFullBoard: () => void;
}

const TAG_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  purple: { bg: 'rgba(124,110,247,0.12)', border: '#3d378a', text: '#b0a8fb' },
  green: { bg: 'rgba(52,211,153,0.10)', border: '#1a4a2a', text: '#34d399' },
  amber: { bg: 'rgba(251,191,36,0.10)', border: '#4a3010', text: '#fbbf24' },
  blue: { bg: 'rgba(96,165,250,0.10)', border: '#1e3a5a', text: '#60a5fa' },
};

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  'in-progress': 'In progress',
  review: 'Review',
  done: 'Done',
};

export function KanbanEmbed({ block, onRemove, onOpenFullBoard }: KanbanEmbedProps) {
  // Group cards by status, max 3 columns
  const statuses = ['backlog', 'in-progress', 'review', 'done'] as const;
  const grouped: Record<string, KanbanCardItem[]> = {};
  for (const s of statuses) grouped[s] = [];
  for (const c of block.cards) {
    if (grouped[c.status]) grouped[c.status].push(c);
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
              {STATUS_LABELS[status]}
            </div>
            {grouped[status].slice(0, 4).map((card) => {
              const tagColors = card.tag ? TAG_COLORS[card.tag.color] : null;
              return (
                <div key={card.id} style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--bd)',
                  borderRadius: 4,
                  padding: '6px 8px',
                  marginBottom: 5,
                }}>
                  {card.tag && tagColors && (
                    <div style={{
                      display: 'inline-block',
                      fontSize: 8,
                      textTransform: 'uppercase',
                      color: tagColors.text,
                      background: tagColors.bg,
                      border: `1px solid ${tagColors.border}`,
                      padding: '0 4px',
                      borderRadius: 2,
                      marginBottom: 3,
                      fontWeight: 600,
                    }}>
                      {card.tag.label}
                    </div>
                  )}
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
