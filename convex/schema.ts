import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Second Brain — Convex schema with Convex Auth
// Uses tokenIdentifier (server-verified) instead of client-supplied userId
// Includes auth tables + app tables: notes, folders, kanbanCards, todos,
// canvasBoards, libraryItems, highlights, appState

export default defineSchema({
  ...authTables,

  // ===== Notes =====
  notes: defineTable({
    tokenIdentifier: v.string(), // server-verified identity from ctx.auth.getUserIdentity()
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
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndFolder", ["tokenIdentifier", "folderId"])
    .index("byTokenAndPinned", ["tokenIdentifier", "pinned"]),

  // ===== Folders (PARA structure) =====
  folders: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    parentId: v.union(v.string(), v.null()),
    paraType: v.union(v.string(), v.null()),
    createdAt: v.string(),
    expanded: v.boolean(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndParent", ["tokenIdentifier", "parentId"]),

  // ===== Kanban Cards =====
  kanbanCards: defineTable({
    tokenIdentifier: v.string(),
    title: v.string(),
    description: v.string(),
    status: v.string(),
    tags: v.array(v.string()),
    linkedNoteId: v.union(v.id("notes"), v.null()),
    order: v.number(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndStatus", ["tokenIdentifier", "status"]),

  // ===== Todos =====
  todos: defineTable({
    tokenIdentifier: v.string(),
    text: v.string(),
    completed: v.boolean(),
    priority: v.string(),
    dueDate: v.union(v.string(), v.null()),
    linkedNoteId: v.union(v.id("notes"), v.null()),
    order: v.number(),
    createdAt: v.string(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndCompleted", ["tokenIdentifier", "completed"]),

  // ===== Canvas Boards =====
  canvasBoards: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    nodes: v.string(),
    edges: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("byToken", ["tokenIdentifier"]),

  // ===== Library Items (reading) =====
  libraryItems: defineTable({
    tokenIdentifier: v.string(),
    title: v.string(),
    author: v.union(v.string(), v.null()),
    type: v.string(),
    source: v.string(),
    content: v.string(),
    status: v.string(),
    progress: v.number(),
    coverUrl: v.union(v.string(), v.null()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndType", ["tokenIdentifier", "type"]),

  // ===== Highlights =====
  highlights: defineTable({
    tokenIdentifier: v.string(),
    libraryItemId: v.id("libraryItems"),
    noteId: v.union(v.id("notes"), v.null()),
    text: v.string(),
    color: v.string(),
    page: v.union(v.number(), v.null()),
    createdAt: v.string(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndLibraryItem", ["tokenIdentifier", "libraryItemId"]),

  // ===== App State (misc per-user state) =====
  appState: defineTable({
    tokenIdentifier: v.string(),
    key: v.string(),
    value: v.string(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndKey", ["tokenIdentifier", "key"]),

  // ===== User Profile (streak, totalConnections — keyed by tokenIdentifier) =====
  userProfiles: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    streak: v.number(),
    lastEditDay: v.string(),
    totalConnections: v.number(),
  }).index("byToken", ["tokenIdentifier"]),
});
