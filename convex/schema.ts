import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Second Brain — Convex schema
// Includes: users, notes, folders, kanbanCards, todos, canvasBoards,
// libraryItems, highlights, appState

export default defineSchema({
  // ===== Users =====
  users: defineTable({
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(), // simple hash for demo; use proper auth in production
    createdAt: v.string(),
    streak: v.number(),
    lastEditDay: v.string(),
    totalConnections: v.number(),
  }).index("byEmail", ["email"]),

  // ===== Notes =====
  notes: defineTable({
    userId: v.id("users"),
    filename: v.string(),
    title: v.string(),
    subtitle: v.string(),
    tags: v.array(v.string()),
    body: v.string(),
    backlinks: v.array(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
    wordCount: v.number(),
    status: v.string(), // 'draft' | 'evergreen'
    folderId: v.string(),
    pinned: v.boolean(),
  })
    .index("byUserId", ["userId"])
    .index("byUserAndFolder", ["userId", "folderId"])
    .index("byUserAndPinned", ["userId", "pinned"]),

  // ===== Folders (PARA structure) =====
  folders: defineTable({
    userId: v.id("users"),
    name: v.string(),
    parentId: v.union(v.string(), v.null()),
    paraType: v.union(v.string(), v.null()), // 'projects' | 'areas' | 'resources' | 'archives'
    createdAt: v.string(),
    expanded: v.boolean(),
  })
    .index("byUserId", ["userId"])
    .index("byUserAndParent", ["userId", "parentId"]),

  // ===== Kanban Cards =====
  kanbanCards: defineTable({
    userId: v.id("users"),
    title: v.string(),
    description: v.string(),
    status: v.string(), // 'todo' | 'doing' | 'done'
    tags: v.array(v.string()),
    linkedNoteId: v.union(v.id("notes"), v.null()),
    order: v.number(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("byUserId", ["userId"])
    .index("byUserAndStatus", ["userId", "status"]),

  // ===== Todos =====
  todos: defineTable({
    userId: v.id("users"),
    text: v.string(),
    completed: v.boolean(),
    priority: v.string(), // 'low' | 'medium' | 'high' | 'urgent'
    dueDate: v.union(v.string(), v.null()),
    linkedNoteId: v.union(v.id("notes"), v.null()),
    order: v.number(),
    createdAt: v.string(),
  })
    .index("byUserId", ["userId"])
    .index("byUserAndCompleted", ["userId", "completed"]),

  // ===== Canvas Boards =====
  canvasBoards: defineTable({
    userId: v.id("users"),
    name: v.string(),
    nodes: v.string(), // JSON string of node array
    edges: v.string(), // JSON string of edge array
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("byUserId", ["userId"]),

  // ===== Library Items (reading) =====
  libraryItems: defineTable({
    userId: v.id("users"),
    title: v.string(),
    author: v.union(v.string(), v.null()),
    type: v.string(), // 'book' | 'paper' | 'article' | 'news'
    source: v.string(), // url or filename
    content: v.string(), // extracted text
    status: v.string(), // 'unread' | 'reading' | 'done'
    progress: v.number(), // 0-100
    coverUrl: v.union(v.string(), v.null()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("byUserId", ["userId"])
    .index("byUserAndType", ["userId", "type"]),

  // ===== Highlights =====
  highlights: defineTable({
    userId: v.id("users"),
    libraryItemId: v.id("libraryItems"),
    noteId: v.union(v.id("notes"), v.null()),
    text: v.string(),
    color: v.string(), // 'yellow' | 'purple' | 'green' | 'blue'
    page: v.union(v.number(), v.null()),
    createdAt: v.string(),
  })
    .index("byUserId", ["userId"])
    .index("byLibraryItem", ["userId", "libraryItemId"]),

  // ===== App State (misc per-user state) =====
  appState: defineTable({
    userId: v.id("users"),
    key: v.string(),
    value: v.string(), // JSON string
  })
    .index("byUserId", ["userId"])
    .index("byUserAndKey", ["userId", "key"]),
});
