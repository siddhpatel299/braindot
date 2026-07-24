'use client';

import { useState } from 'react';
import { Note, Folder, KanbanCardItem, TodoItem } from '@/types';
import { KanbanBoard } from './KanbanBoard';
import { TodoList } from './TodoList';
import { ArrowRight, KanbanSquare } from 'lucide-react';

interface KanbanTodoPageProps {
  notes: Note[];
  folders: Folder[];
  kanbanCards: KanbanCardItem[];
  todos: TodoItem[];
  onAddKanbanCard: (card: Partial<KanbanCardItem> & Pick<KanbanCardItem, 'title' | 'status'>) => KanbanCardItem;
  onMoveKanbanCard: (cardId: string, newStatus: KanbanCardItem['status']) => void;
  onUpdateKanbanCard: (cardId: string, patch: Partial<KanbanCardItem>) => void;
  onDeleteKanbanCard: (cardId: string) => void;
  onAddTodo: (todo: Partial<TodoItem> & Pick<TodoItem, 'text'>) => TodoItem;
  onToggleTodo: (id: string) => void;
  onUpdateTodo: (id: string, patch: Partial<TodoItem>) => void;
  onDeleteTodo: (id: string) => void;
  onOpenNote: (id: string) => void;
  onBack: () => void;
}

type ViewMode = 'board+list' | 'board' | 'list';

export function KanbanTodoPage({
  notes,
  kanbanCards,
  todos,
  onAddKanbanCard,
  onMoveKanbanCard,
  onUpdateKanbanCard,
  onDeleteKanbanCard,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  onOpenNote,
  onBack,
}: KanbanTodoPageProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('board+list');

  const linkedNoteCount = kanbanCards.filter((c) => c.linkedNoteId).length + todos.filter((t) => t.linkedNoteId).length;

  const handleAddCard = (status: KanbanCardItem['status'], title: string) => {
    onAddKanbanCard({
      title,
      description: '',
      status,
      tags: [],
      linkedNoteId: null,
      order: kanbanCards.length,
    });
  };

  const handleAddTodo = (text: string, priority: TodoItem['priority'], dueGroup: TodoItem['dueGroup']) => {
    onAddTodo({
      text,
      done: false,
      priority,
      dueGroup,
      dueDate: null,
      linkedNoteId: null,
      order: todos.length,
    });
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Top bar with breadcrumb + segmented toggle */}
      <div style={{
        height: 44,
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
      }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t3)' }}>
          <button
            onClick={onBack}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--t3)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 12,
              padding: 0,
            }}
          >
            dashboard
          </button>
          <span>/</span>
          <span style={{ color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <KanbanSquare size={13} color="var(--acc2)" />
            kanban + todos
          </span>
        </div>

        {/* Segmented view toggle */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg3)', borderRadius: 4, padding: 2 }}>
          {([
            { id: 'board+list', label: 'board + list' },
            { id: 'board', label: 'board only' },
            { id: 'list', label: 'list only' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setViewMode(opt.id)}
              style={{
                background: viewMode === opt.id ? 'var(--bg1)' : 'transparent',
                border: 'none',
                borderRadius: 3,
                padding: '4px 10px',
                color: viewMode === opt.id ? 'var(--t1)' : 'var(--t3)',
                fontSize: 11,
                fontFamily: 'inherit',
                cursor: 'pointer',
                fontWeight: viewMode === opt.id ? 600 : 400,
                transition: 'background 0.1s, color 0.1s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar: project stats */}
      <div style={{
        height: 40,
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 14,
        fontSize: 11,
        color: 'var(--t3)',
        flexShrink: 0,
      }}>
        <span style={{ color: 'var(--t2)', fontWeight: 600 }}>my workspace</span>
        <span>·</span>
        <span>{kanbanCards.length} tasks</span>
        <span>·</span>
        <span>{todos.length} todos</span>
        <span>·</span>
        <span>{linkedNoteCount} linked to notes</span>
      </div>

      {/* Main split: kanban board + todo rail */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Kanban board — hidden in "list only" mode */}
        <div style={{
          display: viewMode === 'list' ? 'none' : 'flex',
          flex: 1.8,
          minWidth: 0,
          flexDirection: 'column',
        }}>
          <KanbanBoard
            cards={kanbanCards}
            notes={notes}
            onAddCard={handleAddCard}
            onMoveCard={onMoveKanbanCard}
            onUpdateCard={onUpdateKanbanCard}
            onDeleteCard={onDeleteKanbanCard}
            onOpenNote={onOpenNote}
          />
        </div>

        {/* Todo rail — hidden in "board only" mode */}
        <div style={{
          display: viewMode === 'board' ? 'none' : 'flex',
          flex: viewMode === 'list' ? 1 : 1,
          minWidth: 260,
          maxWidth: viewMode === 'list' ? 'none' : 340,
          borderLeft: viewMode === 'list' ? 'none' : '1px solid var(--bd)',
          background: 'var(--bg1)',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Todo header */}
          <div style={{
            padding: '12px 14px 8px',
            borderBottom: '1px solid var(--bd)',
            flexShrink: 0,
          }}>
            <div style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              color: 'var(--t3)',
              fontWeight: 600,
            }}>
              todos
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
              {todos.filter((t) => !t.done).length} pending · {todos.filter((t) => t.done).length} done
            </div>
          </div>
          {/* Todo list */}
          <div style={{ flex: 1, padding: '10px 14px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <TodoList
              todos={todos}
              compact={viewMode !== 'list'}
              notes={notes}
              onToggle={onToggleTodo}
              onAdd={handleAddTodo}
              onUpdate={onUpdateTodo}
              onDelete={onDeleteTodo}
              onOpenNote={onOpenNote}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
