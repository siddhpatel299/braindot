import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// USERS
// ============================================================

export const createOrUpdateUser = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("byEmail", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      // Verify password hash matches
      if (existing.passwordHash !== args.passwordHash) {
        throw new Error("Invalid credentials");
      }
      return existing._id;
    }

    // Create new user
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      passwordHash: args.passwordHash,
      createdAt: now,
      streak: 0,
      lastEditDay: today,
      totalConnections: 0,
    });
    return userId;
  },
});

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("byEmail", (q) => q.eq("email", args.email))
      .first();
  },
});

export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const updateUserStreak = mutation({
  args: {
    userId: v.id("users"),
    streak: v.number(),
    lastEditDay: v.string(),
    totalConnections: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      streak: args.streak,
      lastEditDay: args.lastEditDay,
      totalConnections: args.totalConnections,
    });
  },
});

// ============================================================
// NOTES
// ============================================================

export const getNotes = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notes")
      .withIndex("byUserId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const createNote = mutation({
  args: {
    userId: v.id("users"),
    filename: v.string(),
    title: v.string(),
    subtitle: v.string(),
    tags: v.array(v.string()),
    body: v.string(),
    backlinks: v.array(v.string()),
    wordCount: v.number(),
    status: v.string(),
    folderId: v.string(),
    pinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const noteId = await ctx.db.insert("notes", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    return noteId;
  },
});

export const updateNote = mutation({
  args: {
    noteId: v.id("notes"),
    filename: v.optional(v.string()),
    title: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    body: v.optional(v.string()),
    backlinks: v.optional(v.array(v.string())),
    wordCount: v.optional(v.number()),
    status: v.optional(v.string()),
    folderId: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { noteId, ...patch } = args;
    const cleanPatch: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await ctx.db.patch(noteId, cleanPatch);
  },
});

export const deleteNote = mutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.noteId);
  },
});

export const deleteAllUserNotes = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("byUserId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const n of notes) {
      await ctx.db.delete(n._id);
    }
  },
});

// ============================================================
// FOLDERS
// ============================================================

export const getFolders = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("folders")
      .withIndex("byUserId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const createFolder = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    parentId: v.union(v.string(), v.null()),
    paraType: v.union(v.string(), v.null()),
    expanded: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const folderId = await ctx.db.insert("folders", {
      ...args,
      createdAt: now,
    });
    return folderId;
  },
});

export const updateFolder = mutation({
  args: {
    folderId: v.id("folders"),
    name: v.optional(v.string()),
    expanded: v.optional(v.boolean()),
    paraType: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const { folderId, ...patch } = args;
    const cleanPatch: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await ctx.db.patch(folderId, cleanPatch);
  },
});

export const deleteFolder = mutation({
  args: { folderId: v.id("folders") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.folderId);
  },
});

export const deleteAllUserFolders = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const folders = await ctx.db
      .query("folders")
      .withIndex("byUserId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const f of folders) {
      await ctx.db.delete(f._id);
    }
  },
});

// ============================================================
// KANBAN CARDS
// ============================================================

export const getKanbanCards = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("kanbanCards")
      .withIndex("byUserId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const createKanbanCard = mutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    description: v.string(),
    status: v.string(),
    tags: v.array(v.string()),
    linkedNoteId: v.union(v.id("notes"), v.null()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("kanbanCards", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateKanbanCard = mutation({
  args: {
    cardId: v.id("kanbanCards"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    linkedNoteId: v.optional(v.union(v.id("notes"), v.null())),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { cardId, ...patch } = args;
    const cleanPatch: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await ctx.db.patch(cardId, cleanPatch);
  },
});

export const deleteKanbanCard = mutation({
  args: { cardId: v.id("kanbanCards") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.cardId);
  },
});

// ============================================================
// TODOS
// ============================================================

export const getTodos = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("todos")
      .withIndex("byUserId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const createTodo = mutation({
  args: {
    userId: v.id("users"),
    text: v.string(),
    completed: v.boolean(),
    priority: v.string(),
    dueDate: v.union(v.string(), v.null()),
    linkedNoteId: v.union(v.id("notes"), v.null()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("todos", {
      ...args,
      createdAt: now,
    });
  },
});

export const updateTodo = mutation({
  args: {
    todoId: v.id("todos"),
    text: v.optional(v.string()),
    completed: v.optional(v.boolean()),
    priority: v.optional(v.string()),
    dueDate: v.optional(v.union(v.string(), v.null())),
    linkedNoteId: v.optional(v.union(v.id("notes"), v.null())),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { todoId, ...patch } = args;
    const cleanPatch: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await ctx.db.patch(todoId, cleanPatch);
  },
});

export const deleteTodo = mutation({
  args: { todoId: v.id("todos") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.todoId);
  },
});

// ============================================================
// CANVAS BOARDS
// ============================================================

export const getCanvasBoards = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("canvasBoards")
      .withIndex("byUserId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const createCanvasBoard = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    nodes: v.string(),
    edges: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("canvasBoards", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCanvasBoard = mutation({
  args: {
    boardId: v.id("canvasBoards"),
    name: v.optional(v.string()),
    nodes: v.optional(v.string()),
    edges: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { boardId, ...patch } = args;
    const cleanPatch: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await ctx.db.patch(boardId, cleanPatch);
  },
});

export const deleteCanvasBoard = mutation({
  args: { boardId: v.id("canvasBoards") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.boardId);
  },
});

// ============================================================
// LIBRARY ITEMS (reading)
// ============================================================

export const getLibraryItems = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("libraryItems")
      .withIndex("byUserId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const createLibraryItem = mutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    author: v.union(v.string(), v.null()),
    type: v.string(),
    source: v.string(),
    content: v.string(),
    status: v.string(),
    progress: v.number(),
    coverUrl: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("libraryItems", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateLibraryItem = mutation({
  args: {
    itemId: v.id("libraryItems"),
    title: v.optional(v.string()),
    status: v.optional(v.string()),
    progress: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { itemId, ...patch } = args;
    const cleanPatch: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await ctx.db.patch(itemId, cleanPatch);
  },
});

export const deleteLibraryItem = mutation({
  args: { itemId: v.id("libraryItems") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.itemId);
  },
});

// ============================================================
// HIGHLIGHTS
// ============================================================

export const getHighlights = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("highlights")
      .withIndex("byUserId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const createHighlight = mutation({
  args: {
    userId: v.id("users"),
    libraryItemId: v.id("libraryItems"),
    noteId: v.union(v.id("notes"), v.null()),
    text: v.string(),
    color: v.string(),
    page: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("highlights", {
      ...args,
      createdAt: now,
    });
  },
});

export const deleteHighlight = mutation({
  args: { highlightId: v.id("highlights") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.highlightId);
  },
});

// ============================================================
// BULK OPERATIONS (for syncing localStorage → Convex)
// ============================================================

export const bulkCreateNotes = mutation({
  args: {
    userId: v.id("users"),
    notes: v.array(v.object({
      filename: v.string(),
      title: v.string(),
      subtitle: v.string(),
      tags: v.array(v.string()),
      body: v.string(),
      backlinks: v.array(v.string()),
      wordCount: v.number(),
      status: v.string(),
      folderId: v.string(),
      pinned: v.boolean(),
      createdAt: v.string(),
      updatedAt: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const ids: string[] = [];
    for (const n of args.notes) {
      const id = await ctx.db.insert("notes", {
        userId: args.userId,
        ...n,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const bulkCreateFolders = mutation({
  args: {
    userId: v.id("users"),
    folders: v.array(v.object({
      name: v.string(),
      parentId: v.union(v.string(), v.null()),
      paraType: v.union(v.string(), v.null()),
      createdAt: v.string(),
      expanded: v.boolean(),
      // We also need to map local folder IDs to Convex IDs
      localId: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // Create folders and return mapping of localId → convexId
    const mapping: Record<string, string> = {};
    for (const f of args.folders) {
      const { localId, ...folderData } = f;
      const id = await ctx.db.insert("folders", {
        userId: args.userId,
        ...folderData,
      });
      mapping[localId] = id;
    }
    return mapping;
  },
});
