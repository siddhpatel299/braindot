'use client';

import { useState } from 'react';
import { Note, Folder, KanbanCardItem, TodoItem } from '@/types';
import { KanbanBoard } from './KanbanBoard';
import { TodoList } from './TodoList';
import { KanbanSquare, List, Columns3, Plus } from 'lucide-react';
import { ViewHeader, HeaderSegment, HeaderButton, ViewEmptyState } from './ViewHeader';

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

  const openCount = kanbanCards.filter((c) => c.status !== 'done').length + todos.filter((t) => !t.done).length;
  const facts = [
    `${openCount} open`,
    kanbanCards.filter((c) => c.status === 'done').length > 0
      ? `${kanbanCards.filter((c) => c.status === 'done').length} done`
      : '',
    linkedNoteCount > 0 ? `${linkedNoteCount} linked to notes` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const isEmpty = kanbanCards.length === 0 && todos.length === 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      <ViewHeader icon={KanbanSquare} title="Tasks" facts={isEmpty ? undefined : facts}>
        <HeaderSegment
          value={viewMode}
          onChange={setViewMode}
          options={[
            { id: 'board+list', label: 'both' },
            { id: 'board', label: 'board', icon: Columns3 },
            { id: 'list', label: 'list', icon: List },
          ]}
        />
        <HeaderButton
          icon={Plus}
          label="add task"
          accent
          onClick={() => handleAddCard('backlog', 'New task')}
        />
      </ViewHeader>

      {isEmpty ? (
        <ViewEmptyState
          icon={KanbanSquare}
          heading="No tasks yet."
          body="Tasks here are the ones that produce notes — a draft to finish, a chapter to read. Anything else belongs in your calendar."
          primaryLabel="add the first task"
          onPrimary={() => handleAddCard('backlog', 'New task')}
          secondary="or press ⌘K and type “task”"
        />
      ) : (
      /* Main split: kanban board + todo rail */
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
          {/* Todo header — sentence case, matching the panel headings elsewhere */}
          <div style={{
            padding: '12px 14px 10px',
            borderBottom: '1px solid var(--bd)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 10,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', letterSpacing: '0.02em' }}>
              Todos
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>
              {todos.filter((t) => !t.done).length} pending · {todos.filter((t) => t.done).length} done
            </span>
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
      )}
    </div>
  );
}
